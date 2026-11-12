"""Win32 pseudoconsole transport for the real CLI integration test."""

import contextlib
import ctypes as c
from ctypes import wintypes as w
import msvcrt
import os
import queue
import subprocess
import sys
import threading


class Coord(c.Structure):
    _fields_ = [("x", w.SHORT), ("y", w.SHORT)]


class StartupInfo(c.Structure):
    _fields_ = [
        ("size", w.DWORD), ("reserved", w.LPWSTR), ("desktop", w.LPWSTR), ("title", w.LPWSTR),
        ("x", w.DWORD), ("y", w.DWORD), ("width", w.DWORD), ("height", w.DWORD),
        ("columns", w.DWORD), ("rows", w.DWORD), ("fill", w.DWORD), ("flags", w.DWORD),
        ("show", w.WORD), ("reserved_bytes", w.WORD), ("reserved_pointer", c.c_void_p),
        ("stdin", w.HANDLE), ("stdout", w.HANDLE), ("stderr", w.HANDLE),
    ]


class StartupInfoEx(c.Structure):
    _fields_ = [("startup", StartupInfo), ("attributes", c.c_void_p)]


class ProcessInfo(c.Structure):
    _fields_ = [("process", w.HANDLE), ("thread", w.HANDLE), ("pid", w.DWORD), ("tid", w.DWORD)]


kernel = c.WinDLL("kernel32", use_last_error=True)


def bind(name, result, *arguments):
    function = getattr(kernel, name)
    function.restype = result
    function.argtypes = arguments
    return function


create_pipe = bind("CreatePipe", w.BOOL, c.POINTER(w.HANDLE), c.POINTER(w.HANDLE), c.c_void_p, w.DWORD)
close_handle = bind("CloseHandle", w.BOOL, w.HANDLE)
create_console = bind("CreatePseudoConsole", c.HRESULT, Coord, w.HANDLE, w.HANDLE, w.DWORD, c.POINTER(w.HANDLE))
close_console = bind("ClosePseudoConsole", None, w.HANDLE)
init_attributes = bind("InitializeProcThreadAttributeList", w.BOOL, c.c_void_p, w.DWORD, w.DWORD, c.POINTER(c.c_size_t))
update_attributes = bind("UpdateProcThreadAttribute", w.BOOL, c.c_void_p, w.DWORD, c.c_size_t, c.c_void_p,
                         c.c_size_t, c.c_void_p, c.c_void_p)
delete_attributes = bind("DeleteProcThreadAttributeList", None, c.c_void_p)
create_process = bind("CreateProcessW", w.BOOL, w.LPCWSTR, w.LPWSTR, c.c_void_p, c.c_void_p, w.BOOL, w.DWORD,
                      c.c_void_p, w.LPCWSTR, c.POINTER(StartupInfoEx), c.POINTER(ProcessInfo))
wait_process = bind("WaitForSingleObject", w.DWORD, w.HANDLE, w.DWORD)
exit_code = bind("GetExitCodeProcess", w.BOOL, w.HANDLE, c.POINTER(w.DWORD))
terminate_process = bind("TerminateProcess", w.BOOL, w.HANDLE, w.UINT)
get_console_mode = bind("GetConsoleMode", w.BOOL, w.HANDLE, c.POINTER(w.DWORD))

PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE = 0x00020016
EXTENDED_STARTUPINFO_PRESENT = 0x00080000
CREATE_UNICODE_ENVIRONMENT = 0x00000400
WAIT_OBJECT_0 = 0
WAIT_TIMEOUT = 258


def require(ok):
    if not ok:
        raise c.WinError(c.get_last_error())


@contextlib.contextmanager
def pipe():
    read_end, write_end = w.HANDLE(), w.HANDLE()
    require(create_pipe(c.byref(read_end), c.byref(write_end), None, 0))
    try:
        yield read_end, write_end
    finally:
        for end in (read_end, write_end):
            if end.value is not None:
                close_handle(end)


def take_fd(handle, mode):
    fd = msvcrt.open_osfhandle(handle.value, mode | os.O_BINARY)
    handle.value = None  # The descriptor owns the Win32 handle now.
    return fd


def start(argv, environment, console):
    size = c.c_size_t()
    init_attributes(None, 1, 0, c.byref(size))
    attributes = c.create_string_buffer(size.value)
    require(init_attributes(attributes, 1, 0, c.byref(size)))
    try:
        require(update_attributes(attributes, 0, PROC_THREAD_ATTRIBUTE_PSEUDOCONSOLE, console,
                                  c.sizeof(console), None, None))
        startup = StartupInfoEx()
        startup.startup.size = c.sizeof(startup)
        startup.attributes = c.cast(attributes, c.c_void_p)
        command_line = c.create_unicode_buffer(subprocess.list2cmdline(argv))
        entries = [f"{name}={value}" for name, value in sorted(environment.items(), key=lambda item: item[0].upper())]
        environment_block = c.create_unicode_buffer("\0".join(entries) + "\0")
        process = ProcessInfo()
        flags = EXTENDED_STARTUPINFO_PRESENT | CREATE_UNICODE_ENVIRONMENT
        require(create_process(argv[0], command_line, None, None, False, flags, environment_block,
                               None, c.byref(startup), c.byref(process)))
        close_handle(process.thread)
        return process.process
    finally:
        delete_attributes(attributes)


class ConPty:
    def __init__(self, argv, environment):
        self.console = w.HANDLE()
        self.process = None
        self.input_fd = None
        self.output_fd = None
        self.reader = None
        self.output = queue.Queue()
        self.eof = False
        try:
            with pipe() as (console_in, host_in), pipe() as (host_out, console_out):
                result = create_console(Coord(100, 30), console_in, console_out, 0, c.byref(self.console))
                if result:
                    raise OSError(f"CreatePseudoConsole failed (HRESULT 0x{result & 0xffffffff:08x})")
                self.input_fd = take_fd(host_in, os.O_WRONLY)
                self.output_fd = take_fd(host_out, os.O_RDONLY)
                self.reader = threading.Thread(target=self.read_output, daemon=True)
                self.reader.start()
                # A CI parent can have redirected standard handles even when attached to a console.
                # Open the pseudoconsole's own handles from inside the attached launcher.
                launcher = [sys.executable, "-B", os.path.abspath(__file__), *argv]
                self.process = start(launcher, environment, self.console)
        except BaseException:
            self.close()
            raise

    def read_output(self):
        # Keep draining on a separate thread, including during ClosePseudoConsole on older Windows.
        try:
            while chunk := os.read(self.output_fd, 16384):
                self.output.put(chunk)
        except OSError as error:
            self.output.put(error)
        finally:
            self.output.put(None)

    def read(self, timeout):
        if self.eof:
            return b""
        try:
            chunk = self.output.get(timeout=timeout)
        except queue.Empty:
            return b""
        if isinstance(chunk, OSError):
            raise chunk
        if chunk is None:
            self.eof = True
            return b""
        return chunk

    def write(self, data):
        while data:
            data = data[os.write(self.input_fd, data):]

    def wait(self, timeout):
        state = wait_process(self.process, int(timeout * 1000))
        if state == WAIT_TIMEOUT:
            raise subprocess.TimeoutExpired("ConPTY CLI", timeout)
        require(state == WAIT_OBJECT_0)
        status = w.DWORD()
        require(exit_code(self.process, c.byref(status)))
        return status.value

    def poll(self):
        try:
            return self.wait(0)
        except subprocess.TimeoutExpired:
            return None

    def close(self):
        try:
            if self.process is not None and self.poll() is None:
                require(terminate_process(self.process, 1))
                self.wait(5)
        finally:
            if self.input_fd is not None:
                os.close(self.input_fd)
            if self.console.value is not None:
                close_console(self.console)
            if self.reader is not None:
                self.reader.join(5)
            if self.output_fd is not None:
                os.close(self.output_fd)
            if self.process is not None:
                close_handle(self.process)


if __name__ == "__main__":
    with open("CONIN$", "rb", buffering=0) as input_stream, open("CONOUT$", "wb", buffering=0) as output_stream:
        handle = msvcrt.get_osfhandle(input_stream.fileno())
        before, after = w.DWORD(), w.DWORD()
        require(get_console_mode(handle, c.byref(before)))
        code = subprocess.call(sys.argv[1:], stdin=input_stream, stdout=output_stream, stderr=output_stream)
        require(get_console_mode(handle, c.byref(after)))
        terminal_input_flags = 0x0007  # ENABLE_PROCESSED_INPUT, ENABLE_LINE_INPUT and ENABLE_ECHO_INPUT.
        if before.value & terminal_input_flags != after.value & terminal_input_flags:
            output_stream.write(b"ConPTY input mode was not restored.\r\n")
            code = 1
        raise SystemExit(code)
