# App Store Reject — Agent Skills

Official [Agent Skills](https://agentskills.io) for resolving and preventing App Store and Google Play rejections.

Works with Claude Code, Cursor, GitHub Copilot, Gemini CLI, and 30+ other AI coding tools.

## Installation

```bash
# All skills (recommended)
npx skills add appstorereject/skills

# Just the pre-submission scanner
npx skills add appstorereject/skills --skill appstorereject-scan

# Just the rejection resolver
npx skills add appstorereject/skills --skill appstorereject-resolve
```

## Skills

| Skill | Purpose |
|---|---|
| `appstorereject` | Hub — routes to the right workflow, provides API access |
| `appstorereject-scan` | Proactive pre-submission scan — checks your codebase for common rejection triggers |
| `appstorereject-resolve` | Post-rejection resolution — looks up rejections, plans fixes, drafts appeal letters |

## Authentication

Get an API key at [appstorereject.com/settings/api-keys](https://appstorereject.com/settings/api-keys), then:

```bash
export ASR_API_KEY=asr_...
```

Free tier includes 1 app, 1 scan/month, and unlimited rejection lookups. Full resolution details (solutions, before/after code, example emails) require authentication.

## Requirements

- `curl` (for API calls)
- `bash` 4+ (macOS users: `brew install bash` if on the default bash 3.2)

## How It Works

**Your code never leaves your machine.** The AI agent in your coding tool performs all code analysis locally. The skill provides domain expertise (what to look for, how to fix it). The API provides rejection data (resolution steps, community solutions).

## License

MIT
