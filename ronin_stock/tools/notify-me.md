# notify_me
- **seed:** be told once when another Agent's turn ends
- **when:**
- **depth:** seed
- **serves:** cowork-agent
- **order:** 15

`notify_me <agent>` leaves a one-time mark on that Agent. When its turn next ends (waiting
for you, asking a question, or a tool failed: the stance that turns its selector pill's dot
hollow), one House notice reaches you, e.g. `stockkeeper finished its turn: waiting for you`,
and the mark is gone. Run it again to be told again. It answers `MARKED`, or `NO-SESSION`
when there is no such Agent. The mark lives in the Agent's session folder, so it goes with
the Agent.
