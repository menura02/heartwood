import contextlib
import os
from pathlib import Path
import runpy
import secrets
import signal
import sys


harness = runpy.run_path(str(Path(__file__).with_name("terminal-pty.py")))
Terminal = harness["Terminal"]
relay = harness["relay"]
CODE = rb"((?:[0-9a-f]{8} ){7}[0-9a-f]{8})"
ROOM = rb"(![A-Za-z0-9_-]+(?::localhost)?)"


def account(terminal, origin, username, token, record):
    terminal.expect_ui("Type register, login, or q to quit:", "Kayıt için register")
    terminal.command("register")
    terminal.expect_ui("Matrix server address", "Matrix sunucu adresi")
    terminal.command(origin)
    terminal.expect_ui("Local profile name", "Yerel profil adı")
    terminal.command(username)
    terminal.expect_ui("Account username", "hesap kullanıcı adı")
    terminal.command(username)
    terminal.register(secrets.token_hex(18), token, secrets.token_hex(18))
    terminal.command("/identity")
    record(terminal.expect_ui(f"Account @{username}:localhost", f"Hesap @{username}:localhost"))
    code = terminal.expect(CODE)[1].decode("ascii")
    terminal.expect("heartwood> ")
    return code


def demo(node, origin, directory, turkish):
    transcript = []

    def record(match):
        transcript.append(match[0].decode("utf-8"))

    token = os.environ["HEARTWOOD_TEST_REGISTRATION_TOKEN"]
    with relay(origin) as (relayed, fail_sync, _, _), contextlib.ExitStack() as stack:
        home = Path(directory) / "demo-home"
        cancelled = Terminal(node, home, "cancelled", origin, turkish=turkish, guided=True)
        stack.callback(cancelled.close)
        cancelled.expect_ui("Type register, login, or q to quit:", "Kayıt için register")
        cancelled.type("\x03")
        cancelled.assert_exit()
        assert not cancelled.profile.exists(), "Cancelled setup created a profile"

        alice = Terminal(node, home, "demoalice", relayed, turkish=turkish, guided=True)
        stack.callback(alice.close)
        bob = Terminal(node, home, "demobob", origin, turkish=turkish, guided=True)
        stack.callback(bob.close)
        alice_code = account(alice, relayed, "demoalice", token, record)
        bob_code = account(bob, origin, "demobob", token, record)

        alice.command("/invite @demobob:localhost")
        room = alice.expect(ROOM)[1].decode("ascii")
        alice.expect("heartwood> ")
        alice.command("/guide")
        record(alice.expect_ui(
            "Chat is waiting for the other person to accept your invitation.",
            "Sohbet karşı tarafın daveti kabul etmesini bekliyor.",
        ))
        alice.expect("heartwood> ")
        bob.command("/guide")
        record(bob.expect_ui("An invitation is waiting.", "Bir davet bekliyor."))
        bob.expect("heartwood> ")
        bob.command("/accept " + room)
        record(bob.expect_ui("Invitation accepted.", "İstek kabul edildi."))
        bob.expect("heartwood> ")
        bob.command("/guide")
        record(bob.expect_ui("Chat needs device verification.", "Sohbet için cihaz doğrulaması gerekli."))
        bob.expect("heartwood> ")

        for terminal, peer, code in [(alice, "demobob", bob_code), (bob, "demoalice", alice_code)]:
            # The harness knows both fixture identities. Real users compare over a trusted second channel.
            terminal.command(f"/verify @{peer}:localhost {code}")
            record(terminal.expect_ui("Device code verified.", "Cihaz kodu doğrulandı."))
            terminal.expect("heartwood> ")
            terminal.command("/guide")
            record(terminal.expect_ui("A chat has a verified device.", "Cihazı doğrulanmış bir sohbet var."))
            terminal.expect("heartwood> ")
            terminal.command("/chat " + room)
            terminal.expect(terminal.chat_prompt)

        first = "Merhaba, şifreli demo." if turkish else "Hello from the encrypted demo."
        alice.command(first)
        record(bob.expect("@demoalice:localhost  " + first))
        fail_sync.set()
        record(alice.expect_ui("Reconnecting…", "Yeniden bağlanıyor…"))
        record(alice.expect_ui("Connected.", "Bağlı."))
        last = "Bağlantıdan sonra merhaba." if turkish else "Hello after reconnecting."
        bob.command(last)
        record(alice.expect("@demobob:localhost  " + last))

        for terminal in (alice, bob):
            terminal.command("/exit")
            terminal.assert_exit()
    sys.stdout.buffer.write(("\n".join(transcript) + "\n").encode("utf-8"))


def cancel(*_args):
    raise KeyboardInterrupt


signal.signal(signal.SIGTERM, cancel)
if __name__ == "__main__":
    demo(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] == "tr")
