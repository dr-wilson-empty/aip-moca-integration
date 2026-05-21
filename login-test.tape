# login-test.tape
#
# Minimal VHS test recording for `aip login`.
# Demonstrates the Hide/Show directives around a setup step so you can
# verify they behave the way you expect before we write the full demo.
#
# Run:
#   brew install vhs        # one time, if not installed
#   vhs login-test.tape     # produces login-test.gif
#
# Notes about what you should see:
#   - The setup line (export HOME=...) is hidden, so the recording
#     starts with a clean prompt as if you just opened a terminal.
#   - `aip login` renders a clack select menu; we press Enter to
#     accept the highlighted default ("Generate a new keypair").
#   - Both passphrase prompts mask the typed input as asterisks; that
#     is clack's built-in behaviour, not VHS magic.
#   - `aip whoami` at the end shows the freshly created wallet with a
#     0 SOL and 0 USDC balance, confirming the keystore was written
#     and decrypted successfully.

# ---------- Output ----------
Output login-test.gif

# ---------- Look and feel ----------
Set Shell zsh
Set FontSize 16
Set Width 1100
Set Height 700
Set Theme "Catppuccin Mocha"
Set TypingSpeed 55ms
Set PlaybackSpeed 1.0

# ---------- Setup (hidden) ----------
# Move HOME to a throwaway directory so this recording does NOT touch
# your real ~/.aip keystore. The Hide / Show pair wraps the command
# so it never appears on the captured frames.
Hide
Type "export HOME=$(mktemp -d) && clear"
Enter
Sleep 300ms
Show

# ---------- aip login ----------
Type "aip login"
Enter
Sleep 2s

# The clack select menu is now showing three options with
# "Generate a new keypair" highlighted as the default. Press Enter
# to accept it.
Enter
Sleep 1500ms

# Passphrase prompt. clack masks the input as asterisks while you
# type, so this is safe to keep visible. "demo1234" is fine for a
# demo recording.
Type "demo1234"
Enter
Sleep 800ms

# Confirm passphrase.
Type "demo1234"
Enter
Sleep 2500ms

# The success card renders here: brand banner, public key, keystore
# path, network. Pause long enough that a viewer can read it.
Sleep 3s

# ---------- Verify ----------
Type "aip whoami"
Enter
Sleep 3500ms

# End of recording.
Sleep 500ms
