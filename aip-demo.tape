# aip-demo.tape
#
# Full demo recording for the @aipagents/cli launch.
#
# Run:
#   vhs aip-demo.tape
#
# Produces aip-demo.gif (or change Output to .mp4 for Twitter).
#
# Flow:
#   1.  Open the interactive shell.
#   2.  whoami       -> "not logged in" warning.
#   3.  login        -> import a base58 secret key, set a passphrase.
#   4.  agents ls    -> marketplace listing.
#   5.  ask          -> one paid task to Audit Agent ("Top 3 attack
#                       vectors for PDA-based escrow on Solana").
#   6.  create       -> full create wizard for Whitepaper Navigator
#                       (two capabilities, on-chain register included).
#   7.  resolve      -> identity inspector on the agent we just
#                       created, proves the PDA write landed.
#   8.  chat         -> two paid turns with Whitepaper Navigator:
#                       first summarise the Bitcoin whitepaper, then
#                       drill into a specific technical detail.
#   9.  whoami       -> wallet at the end (balance after spending).
#   10. exit         -> close the shell.
#
# The base58 key in this file belongs to a throwaway devnet wallet
# pre-funded with about 1 SOL and 5 USDC. Do not reuse it for anything
# real.

# ---------- Output ----------
# Both formats produced in a single VHS run. The .gif is convenient
# for GitHub / Twitter timeline autoplay; the .mp4 is smaller and
# sharper for the actual launch tweet.
Output aip-demo.gif
Output aip-demo.mp4

# ---------- Look and feel ----------
Set Shell zsh
Set FontSize 14
Set FontFamily "Geist Mono"
Set Width 1440
Set Height 810
Set Padding 30
Set TypingSpeed 55ms
Set PlaybackSpeed 1.0
Set Theme { "name": "AIP", "black": "#1a1b26", "red": "#f7768e", "green": "#b5e8a0", "yellow": "#e0af68", "blue": "#7aa2f7", "magenta": "#bb9af7", "cyan": "#7dcfff", "white": "#c0caf5", "brightBlack": "#414868", "brightRed": "#ff7a93", "brightGreen": "#c3f0a3", "brightYellow": "#ffd580", "brightBlue": "#8db0ff", "brightMagenta": "#c8a8ff", "brightCyan": "#9ae0ff", "brightWhite": "#e0e6f5", "background": "#0d0e15", "foreground": "#d8dde8", "cursor": "#b5e8a0", "selection": "#283457" }

# ---------- Environment ----------
# Override HOME so the keystore lands somewhere neutral. Without this
# the success card shows the host machine's username in the keystore
# path. We export HOME from inside the shell because VHS's `Env`
# directive does not survive the shell's own startup files (zshrc can
# reset HOME).
Hide
# Set up a clean HOME, copy the agent's system prompt next to the
# wizard so `aip create -f ./wp-prompt.md` can pick it up without
# opening an editor or relying on user input that VHS cannot type
# faithfully (em-dashes, section glyphs, etc).
Type "rm -rf /tmp/aip-demo && mkdir -p /tmp/aip-demo && export HOME=/tmp/aip-demo && cd /tmp/aip-demo && cp /Users/mehmethayirli/Documents/GitHub/aip-website/aip-demo-prompts/whitepaper-navigator.md ./wp-prompt.md && clear"
Enter
Sleep 500ms
Show

# ---------- 1. Open the interactive shell ----------
Type "aip"
Enter
# Welcome banner + AIP > prompt render
Sleep 2500ms

# ---------- 2. whoami -> not logged in ----------
Type "whoami"
Enter
Sleep 2s

# ---------- 3. login (import a base58 secret key) ----------
Type "login"
Enter

# Give the clack select menu time to draw before navigating it.
Sleep 2s

# Default is "Generate a new keypair". We want "Paste a base58 secret
# key", which is one position below. Press the Down arrow once, then
# Enter.
Down
Sleep 400ms
Enter

# Wait for the base58 password prompt to render. clack masks input
# as asterisks while characters arrive, so the key never appears
# readable in the recording.
Sleep 2s
Type@20ms "2GSDbNkKEFiciZwMaKpnte4XUn3iP2NiNAH4rCrjxb6jBBCMvu6qcxuru5Xynbao66om6fGwohNsJ3n9TmA78ueE"
Enter

# Wait for the first passphrase prompt.
Sleep 2s
Type "12345678"
Enter

# Wait for the confirm prompt.
Sleep 1500ms
Type "12345678"
Enter

# Success card renders: brand banner, public key, keystore path,
# network. Pause long enough to read it.
Sleep 5s

# ---------- 4. agents ls ----------
Type "agents ls"
Enter
# Marketplace fetch + table render. Generous so all rows are
# visible long enough to read.
Sleep 5s

# ---------- 5. ask Audit Agent ----------
# Audit Agent's default capability is code.audit (0.75 USDC). It is a
# security-auditor persona that will happily enumerate attack vectors
# for a named primitive. The question is short, demo-friendly, and
# lands squarely inside the capability so the preamble guard does not
# reject it.
Type "ask audit-agent 'Top 3 attack vectors for PDA-based escrow on Solana'"
Enter

# Agent resolution + card fetch take several seconds on devnet
# before the unlock prompt fires. clack discards any pre-buffered
# stdin, so we must wait long enough for the prompt to be visible
# on screen before typing. 5 seconds is a safe margin.
Sleep 5s
Type "12345678"
Enter

# Wait for the escrow tx to settle and the response to stream back.
# Devnet confirmations + Haiku response total ~15-25s on a normal
# day. 28s gives a comfortable margin.
Sleep 28s

# ---------- 6. create the Whitepaper Navigator agent ----------
# `aip create` walks an interactive wizard, then publishes the agent
# on the marketplace AND writes the on-chain PDA in a single command.
# We pass --prompt-file so the multi-line system prompt (staged in the
# Hide setup block) is loaded verbatim - clack's text widget would
# truncate any multi-line paste.
Type "create -f ./wp-prompt.md"
Enter

# Unlock prompt fires first (the create wizard signs the AIP-AUTH
# header + the on-chain register tx, both need the keypair).
Sleep 5s
Type "12345678"
Enter

# Agent id prompt.
Sleep 3s
Type "whitepaper-navigator"
Enter

# Display name.
Sleep 1500ms
Type "Whitepaper Navigator Agent"
Enter

# Short description (optional, but worth filling for the marketplace card).
Sleep 1500ms
Type "Reads crypto whitepapers and answers questions or produces structured summaries."
Enter

# System prompt step is skipped because of --prompt-file. The wizard
# prints "Loaded NNN chars from ./wp-prompt.md" and moves on.

# Model provider select - default is Anthropic. Just Enter.
Sleep 2s
Enter

# Tier select - default is Platform (Anthropic-hosted key). Just Enter.
Sleep 1500ms
Enter

# Capability #1 of 2: whitepaper.summary @ 0.08 USDC.
Sleep 1500ms
Type "whitepaper.summary"
Enter
Sleep 1s
Type "Whitepaper Summary"
Enter
Sleep 1s
Type "0.08"
Enter

# "Add another capability?" defaults to No. We want Yes, so toggle.
Sleep 1500ms
Right
Sleep 300ms
Enter

# Capability #2 of 2: whitepaper.ask @ 0.05 USDC.
Sleep 1500ms
Type "whitepaper.ask"
Enter
Sleep 1s
Type "Whitepaper Q&A"
Enter
Sleep 1s
Type "0.05"
Enter

# "Add another capability?" - we are done, accept default No.
Sleep 1500ms
Enter

# "List this agent publicly on the marketplace?" - default Yes.
Sleep 1500ms
Enter

# Summary card renders. The "What next?" select defaults to "Publish".
Sleep 3s
Enter

# Backend register (~1-2s) + on-chain PDA write (5-15s on devnet) +
# success card. 30s comfortable margin.
Sleep 30s

# ---------- 7. resolve the agent we just created ----------
# Resolution reads the AgentRecord PDA directly from Solana, so this
# also doubles as proof that the on-chain register step in step 6
# actually landed.
Type "resolve whitepaper-navigator"
Enter
Sleep 8s

# ---------- 8. chat with Whitepaper Navigator ----------
# We pick the whitepaper.ask capability so both turns (a summary
# request and a follow-up factual question) sit cleanly inside the
# Q&A mode the system prompt defines.
Type "chat whitepaper-navigator --capability whitepaper.ask"
Enter

# Unlock prompt (separate child process, no cache).
Sleep 5s
Type "12345678"
Enter

# REPL header + > prompt render after unlock.
Sleep 4s

# First turn - ask the agent to summarise Satoshi's Bitcoin whitepaper.
Type "Summarize the Bitcoin whitepaper by Satoshi Nakamoto"
Enter
Sleep 28s

# Second turn - drill into one specific technical detail.
Type "What's the block time target and how is difficulty adjusted?"
Enter
Sleep 28s

# Leave the chat session.
Type "/exit"
Enter
Sleep 2s

# ---------- 9. whoami (final state, balance reduced) ----------
Type "whoami"
Enter
# Wallet pubkey, network, balances, explorer link.
Sleep 6s

# ---------- 10. exit the shell ----------
Type "exit"
Enter
Sleep 2s
