export const generateRcContent = (
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
	mkdir -p "$(dirname "$SHELL2NODE_LOG")"
	touch "$SHELL2NODE_MARKER"
	# give the parent some time (not strictly necessary)
	sleep 0.05
	exit 0
  elif [ "$1" = "cancel" ]; then
	echo "[shell2node] canceling capture and exiting..."
	rm -f "$SHELL2NODE_MARKER"
	sleep 0.05
	exit 0
  else
	# fallback to the real command if the user has a system binary named shell2node
	command shell2node "$@"
  fi
}

# Prompt hint to show capture mode
if [ -n "$PS1" ]; then
  PS1="[shell2node capture] $PS1"
fi

# Prevent loading user's heavy rc files to keep behavior predictable,
# but allow them to source their normal rc manually if needed.
# (We keep it minimal — this is deliberate for the MLP)
`;
