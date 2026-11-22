# mika
- **seed:** ask Mika, Ronin's help assistant
- **when:** service:mika
- **depth:** seed
- **serves:**
- **order:** 80

Reach for `mika` when the house assistant should answer or carry a bounded request.
Ronin Services supplies Mika; whether it is installed and switched on is a Machine
settings fact.

**Live tool:** `mika` starts or reaches the constrained house assistant.

Mika's house guidance limits how she uses the shared Machine settings tool. The tool does
not identify or reject her; the launcher does not change its write behavior.

## Usage

`mika "<request>"` → hands plain words to the house assistant, starting her if needed. Her Build Brief emphasizes the related enabled-feature tools; the launcher carries no job vocabulary. When she is already up it hands off to `edges send`, so the request is either `DELIVERED` or durably `QUEUED`; starting her prints `STARTED`, and exit 5 = Ronin unreachable.
