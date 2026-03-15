# Product Guidelines - NSW Transport API

## Tone & Voice
- **Technical & Concise:** All documentation, API response descriptions, and internal communication should be clear, direct, and factual. Minimize the use of filler words and excessive jargon.
- **Precision:** Use precise technical terms. For example, specify "GTFS-RT Protocol Buffer" rather than just "real-time data."

## UX Principles for API Design
- **Performance First:** Every endpoint must be optimized for speed. Prioritize data freshness and low latency. If a request takes longer than 200ms, consider optimization or caching strategies.
- **Consistency & Predictability:** API paths, parameter names, and response structures must follow a strict, uniform pattern across all transport modes and versions.
- **Informative Feedback:** When an error occurs, provide a clear, actionable message and the correct HTTP status code. Help the developer understand exactly why the request failed and how to fix it.

## Branding & Personality
- **Innovative & Fast:** The API should feel modern and cutting-edge. This is reflected in the use of high-performance technologies like GraphQL, Rust-based loaders (if applicable), and real-time streaming capabilities.
- **Agility:** The project documentation and public presence should emphasize rapid updates, responsiveness to developer feedback, and a forward-thinking approach to transit data.

## Implementation Standards
- **Data Integrity:** Never compromise on the accuracy of the transport data. If the upstream source is unreliable, reflect this state clearly in the API rather than providing stale or incorrect information.
- **Security by Design:** Authentication and authorization are not optional. Every user-facing endpoint must be protected by the established auth protocols.
