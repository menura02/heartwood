import os
import select
import signal
import subprocess
import sys

import synapse


def interrupt(_signum, _frame):
    raise KeyboardInterrupt


def main():
    if synapse.__version__ != "1.164.2":
        raise RuntimeError("Synapse 1.164.2 required")
    signal.signal(signal.SIGTERM, interrupt)
    os.chdir(sys.argv[1])
    command = [
        sys.executable, "-m", "synapse.app.homeserver",
        "-c", "homeserver.yaml", "-c", "admin.yaml",
    ]
    subprocess.run([*command, "--generate-keys"], check=True)
    with subprocess.Popen(command) as server:
        unexpected_exit = None
        try:
            while server.poll() is None:
                readable, _, _ = select.select([sys.stdin], [], [], 0.25)
                if readable and not sys.stdin.buffer.read(1):
                    break
            else:
                unexpected_exit = server.returncode
        except KeyboardInterrupt:
            pass
        finally:
            if server.poll() is None:
                server.terminate()
                try:
                    server.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    server.kill()
                    server.wait()
        if unexpected_exit is not None:
            raise SystemExit(unexpected_exit if unexpected_exit > 0 else 1)


if __name__ == "__main__":
    main()
