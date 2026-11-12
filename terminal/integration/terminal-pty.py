import contextlib
import http.client
import http.server
import os
import pathlib
import re
import socket
import subprocess
import sys
import threading
import time
import urllib.parse

if sys.platform == "win32":
    from conpty import ConPty
else:
    import pty
    import select
    import termios


class Terminal:
    def __init__(self, node, home, account, origin, turkish=False, guided=False):
        self.output = bytearray()
        self.offset = 0
        self.profile = home / ".heartwood" / account
        self.turkish = turkish
        self.chat_prompt = "sohbet> " if turkish else "chat> "
        environment = {**os.environ, "HOME": str(home), "TERM": "xterm-256color"}
        environment.pop("HEARTWOOD_LANG", None)
        environment.pop("HEARTWOOD_TEST_REGISTRATION_TOKEN", None)
        startup = ["--lang", "tr", "kayit"] if turkish else ["register"]
        if turkish:
            environment["HEARTWOOD_LANG"] = "en"
        command = [node, "src/cli.ts", *startup, account, origin, account]
        if guided:
            command = [node, "src/cli.ts", "--lang", "tr" if turkish else "en", "onboard"]
        if sys.platform == "win32":
            self.child = ConPty(command, {**environment, "USERPROFILE": str(home)})
        else:
            self.master, self.slave = pty.openpty()
            try:
                termios.tcsetwinsize(self.slave, (30, 100))
                self.flags = termios.tcgetattr(self.slave)[3]
                self.child = subprocess.Popen(command, stdin=self.slave, stdout=self.slave, stderr=self.slave,
                                              env=environment)
            except BaseException:
                os.close(self.master)
                os.close(self.slave)
                raise

    def drain(self, timeout):
        if sys.platform == "win32":
            self.output.extend(self.child.read(timeout))
        else:
            readable, _, _ = select.select([self.master], [], [], timeout)
            if readable:
                self.output.extend(os.read(self.master, 16384))

    def expect(self, value, timeout=12):
        if sys.platform == "win32" and isinstance(value, str):
            value = value.rstrip(" ")
        pattern = re.compile(re.escape(value.encode()) if isinstance(value, str) else value)
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            match = pattern.search(self.output, self.offset)
            if match:
                self.offset = match.end()
                return match
            self.drain(0.1)
            if self.child.poll() is not None and not pattern.search(self.output, self.offset):
                break
        label = value if isinstance(value, str) else "expected pattern"
        raise AssertionError(f"Terminal did not reach {label} (exit {self.child.poll()})")

    def type(self, value):
        if sys.platform == "win32":
            self.child.write(value.encode())
        else:
            os.write(self.master, value.encode())

    def command(self, value):
        self.type(value + "\r")

    def expect_ui(self, english, turkish):
        return self.expect(turkish if self.turkish else english)

    def register(self, password, token, passphrase):
        self.expect_ui("Account password:", "Hesap parolası:")
        self.command(password)
        self.expect_ui("Registration token:", "Kayıt belirteci:")
        self.command(token)
        self.expect_ui("Local crypto store passphrase:", "Yerel kripto deposu parolası:")
        self.command(passphrase)
        self.expect_ui("Repeat the store passphrase:", "Depo parolasını tekrar girin:")
        self.command(passphrase)
        self.expect("heartwood> ")
        for secret in [password, token, passphrase]:
            assert secret.encode() not in self.output, "A secret was echoed"

    def assert_exit(self):
        assert self.child.wait(timeout=5) == 0, "CLI exited with an error"
        if sys.platform != "win32":
            mask = termios.ECHO | termios.ICANON | termios.ISIG
            assert termios.tcgetattr(self.slave)[3] & mask == self.flags & mask, "TTY mode not restored"
        assert not (self.profile / "in-use").exists(), "Profile lock remained"

    def close(self):
        if sys.platform == "win32":
            self.child.close()
            return
        if self.child.poll() is None:
            self.child.kill()
            self.child.wait(timeout=5)
        os.close(self.master)
        os.close(self.slave)


@contextlib.contextmanager
def relay(origin):
    target = urllib.parse.urlsplit(origin)
    fail_sync = threading.Event()
    hold_sync = threading.Event()
    request_held = threading.Event()
    release_request = threading.Event()

    class Proxy(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args):
            pass

        def forward(self):
            if self.path.startswith("/_matrix/client/v3/sync?"):
                if fail_sync.is_set():
                    fail_sync.clear()
                    self.connection.shutdown(socket.SHUT_RDWR)
                    return
                if hold_sync.is_set():
                    request_held.set()
                    release_request.wait(10)
                    return
            size = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(size) if size else None
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() in {"authorization", "content-type", "accept"}}
            connection = http.client.HTTPConnection(target.hostname, target.port, timeout=10)
            try:
                connection.request(self.command, self.path, body, headers)
                upstream = connection.getresponse()
                payload = upstream.read()
                self.send_response(upstream.status)
                self.send_header("Content-Type", upstream.getheader("Content-Type", "application/json"))
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
            finally:
                connection.close()

        do_GET = do_POST = do_PUT = forward

    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Proxy) as server:
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            yield f"http://127.0.0.1:{server.server_port}", fail_sync, hold_sync, request_held
        finally:
            release_request.set()
            server.shutdown()
            thread.join()


def scenario(node, origin, root, token):
    with relay(origin) as (relayed, fail_sync, hold_sync, request_held), contextlib.ExitStack() as stack:
        home = pathlib.Path(root) / "pty-home"
        alice = Terminal(node, home, "ptyalice", relayed)
        stack.callback(alice.close)
        bob = Terminal(node, home, "ptybob", origin, turkish=True)
        stack.callback(bob.close)
        for terminal, name in [(alice, "alice"), (bob, "bob")]:
            terminal.register("pty-password-" + name, token, "pty-passphrase-" + name)
            terminal.command("/kimlik" if terminal is alice else "/identity")
            terminal.expect_ui("Account @pty", "Hesap @pty")
            terminal.code = terminal.expect(rb"((?:[0-9a-f]{8} ){7}[0-9a-f]{8})")[1].decode()
            terminal.expect("heartwood> ")

        alice.command("/gecersiz")
        alice.expect("Unknown command")
        alice.expect("heartwood> ")
        bob.command("/unknown")
        bob.expect("Bilinmeyen komut")
        bob.expect("heartwood> ")
        alice.command("/invite @ptybob:localhost")
        room = alice.expect(rb"(![A-Za-z0-9_-]+(?::localhost)?)")[1].decode()
        alice.expect("heartwood> ")
        bob.command("/kabul " + room)
        bob.expect("İstek kabul edildi.")
        bob.expect("heartwood> ")
        for terminal, peer, name in [(alice, bob, "ptybob"), (bob, alice, "ptyalice")]:
            command = "/verify" if terminal is alice else "/dogrula"
            terminal.command(f"{command} @{name}:localhost {peer.code}")
            terminal.expect_ui("Device code verified.", "Cihaz kodu doğrulandı.")
            terminal.expect("heartwood> ")
            terminal.command("/sohbet " + room if terminal is alice else "/chat " + room)
            terminal.expect(terminal.chat_prompt)

        fail_sync.set()
        alice.expect("Reconnecting…")
        alice.expect("Connected.")
        alice.expect(alice.chat_prompt)
        draft = "Yazıyorum çığ 🚲 " + "a" * (24 if sys.platform == "win32" else 120)
        alice.type(draft)
        bob.command("Türkçe bildirim şüÖ 🚀")
        bob.expect("Şifreli olay sunucu tarafından kabul edildi.")
        bob.expect(bob.chat_prompt)
        notification = alice.expect("@ptybob:localhost  Türkçe bildirim şüÖ 🚀")
        redraw = alice.expect(alice.chat_prompt + draft)
        if sys.platform != "win32":
            assert b"\r\n\r\n" in alice.output[notification.end():redraw.start()], "Wrapped redraw erased its notification row"
        alice.type("\r")
        alice.expect("The server accepted the encrypted event.")
        alice.expect(alice.chat_prompt)
        bob.expect("@ptyalice:localhost  " + draft)

        alice.type("\x1b[200~")
        alice.type("YAPISTIRMA-MESAJI\n/geri\n/cikis")
        alice.type("\x1b[201~")
        alice.expect(b"\x07")
        alice.command("Yapıştırma sonrası çalışıyor")
        bob.expect("@ptyalice:localhost  Yapıştırma sonrası çalışıyor")
        assert b"@ptyalice:localhost  YAPISTIRMA-MESAJI" not in bob.output
        hold_sync.set()
        assert request_held.wait(5), "No live request to cancel"
        alice.type("\x03")
        alice.assert_exit()
        bob.command("/back")
        bob.expect("heartwood> ")
        bob.command("/gecmis " + room)
        bob.expect("Geçmiş sayfası 1")
        bob.expect("@ptyalice:localhost  Yapıştırma sonrası çalışıyor")
        bob.expect("heartwood> ")
        bob.command("/cikis")
        bob.assert_exit()


if __name__ == "__main__":
    scenario(sys.argv[1], sys.argv[2], sys.argv[3], os.environ["HEARTWOOD_TEST_REGISTRATION_TOKEN"])
    terminal = "Windows ConPTY" if sys.platform == "win32" else "Linux PTY"
    print(f"{terminal}: both locales, aliases, secrets, redraw, Unicode, reconnect, history and exit passed.")
