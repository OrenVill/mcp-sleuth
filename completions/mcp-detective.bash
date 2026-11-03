# Bash completion for mcp-detective (terminal subcommands + daemon).
# Install: see README.npm.md "Shell completion"

_mcp_detective() {
  local cur prev first second
  cur="${COMP_WORDS[COMP_CWORD]}"
  prev="${COMP_WORDS[COMP_CWORD - 1]}"
  first="${COMP_WORDS[1]}"
  second="${COMP_WORDS[2]}"

  local -a top_cmds=(
    readiness audit export call provider server chat tui help stop
  )
  local -a daemon_opts=(--no-open)
  local -a global_flags=(
    --json --discover --server --passphrase-file --provider-id --servers
    -o --output --args
  )

  _mcp_detective_complete_words() {
    COMPREPLY=($(compgen -W "$*" -- "$cur"))
  }

  _mcp_detective_complete_flags() {
    _mcp_detective_complete_words "${global_flags[@]}"
  }

  # Value-taking flags: no completion after the flag name.
  case "$prev" in
    -o | --output | --server | --passphrase-file | --provider-id | --servers | --args)
      return 0
      ;;
  esac

  if [[ "$cur" == -* ]]; then
    _mcp_detective_complete_flags
    return 0
  fi

  if ((COMP_CWORD == 1)); then
    _mcp_detective_complete_words "${top_cmds[@]}" "${daemon_opts[@]}"
    return 0
  fi

  case "$first" in
    audit)
      if ((COMP_CWORD == 2)); then
        _mcp_detective_complete_words permission injection
      else
        _mcp_detective_complete_flags
      fi
      ;;
    export)
      if ((COMP_CWORD == 2)); then
        _mcp_detective_complete_words handoff tools client-config
      else
        _mcp_detective_complete_flags
      fi
      ;;
    provider | server)
      if ((COMP_CWORD == 2)); then
        _mcp_detective_complete_words list add remove
      else
        _mcp_detective_complete_flags
      fi
      ;;
    call | readiness | chat | tui | help)
      _mcp_detective_complete_flags
      ;;
    stop)
      ;;
    *)
      # Daemon mode: optional port or --no-open already handled at cword 1
      if ((COMP_CWORD >= 2)); then
        _mcp_detective_complete_words "${daemon_opts[@]}"
      fi
      ;;
  esac
}

complete -F _mcp_detective mcp-detective mcp-sleuth
