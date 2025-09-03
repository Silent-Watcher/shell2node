export const generateBashRcContent = (
	logFile: string,
	markerFile: string,
): string => `
# shell2node temporary rc (auto-generated). Do NOT commit.
export SHELL2NODE_LOG=${JSON.stringify(logFile)}
export SHELL2NODE_MARKER=${JSON.stringify(markerFile)}

# Append every command before execution (timestamp + the command)
trap 'printf "%s %s\\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$BASH_COMMAND" >> "$SHELL2NODE_LOG"' DEBUG

# Define shell2node helper
shell2node() {
  if [ "$1" = "save" ]; then
    echo "[shell2node] saving capture and exiting..."
    touch "$SHELL2NODE_MARKER"
    sleep 0.05
    exit 0
  elif [ "$1" = "cancel" ]; then
    echo "[shell2node] canceling capture and exiting..."
    rm -f "$SHELL2NODE_MARKER"
    sleep 0.05
    exit 0
  else
    command shell2node "$@"
  fi
}

# Prompt hint to show capture mode
if [ -n "$PS1" ]; then
  PS1="[shell2node capture] $PS1"
fi
`;

export const generateZshRcContent = (logFile: string, markerFile: string) => `
	# shell2node temporary zshrc (auto-generated). Do NOT commit.
export SHELL2NODE_LOG=${JSON.stringify(logFile)}
export SHELL2NODE_MARKER=${JSON.stringify(markerFile)}

# helper that actually logs a command (used by preexec hook)
shell2node_preexec() {
  # $1 is the command about to be executed
  printf "%s %s\\n" "$(date -u +"%Y-%m-%dT%H:%M:%SZ")" "$1" >> "$SHELL2NODE_LOG"
  return 0
}

# Try to register a preexec hook using add-zsh-hook if available for compatibility.
if typeset -f add-zsh-hook >/dev/null 2>&1; then
  add-zsh-hook preexec shell2node_preexec
else
  # Fallback: define preexec directly (works in many zsh versions)
  preexec() { shell2node_preexec "$1"; }
fi

# Define shell2node helper
shell2node() {
  if [ "$1" = "save" ]; then
    echo "[shell2node] saving capture and exiting..."
    touch "$SHELL2NODE_MARKER"
    sleep 0.05
    exit 0
  elif [ "$1" = "cancel" ]; then
    echo "[shell2node] canceling capture and exiting..."
    rm -f "$SHELL2NODE_MARKER"
    sleep 0.05
    exit 0
  else
    # If a system binary named shell2node exists, defer to it
    command shell2node "$@"
  fi
}

# Prompt hint to show capture mode
if [ -n "$PROMPT" ]; then
  PROMPT="[shell2node capture] $PROMPT"
fi
`;
