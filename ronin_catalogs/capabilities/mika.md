# Mika
- **label:** Mika
- **blurb:** How do I ask the installed house assistant for help?
- **class:** feature
- **requires:** installation:ronin_services
- **order:** 80

Reach for this capability when the installed house assistant should answer or carry a
bounded request. Ronin Services is the installation that supplies Mika; it is not itself
an Agent capability. Installation state and component configuration remain Machine
Settings facts.

**Live tool:** `mika` starts or reaches the constrained house assistant.

## Tools

| Tool | Authority | Teach | Help |
|---|---|---|---|
| `mika` | ask: start or reach the constrained house assistant | priority | `mika` |

Mika's house guidance limits how she uses the shared Machine settings tool. The tool does
not identify or reject her; the launcher does not change its write behavior.
