# Mobile Next Architecture

## Context

Current state in this repository:

- `app/` is the working Android client for field staff.
- `portal/` is the broader web portal with worker, dispatcher, and admin functionality.

The current mobile app already covers the right business core, but it is implemented as a single Android module with mixed UI, data, and domain concerns. For a new Android + iOS product line, we need a structure that lets us share business logic, reduce UI drift, and keep the mobile scope intentionally smaller than the portal.

## Product Direction

The new mobile branch should feel like a focused business tool for field execution:

- start from a personal workbench, not from an admin dashboard
- keep only mobile-critical flows
- use one shared domain/data layer for Android and iOS
- simplify navigation and status handling
- design for short sessions, unstable network, and fast handoff to maps/calls/chat

## Mobile MVP Scope

Included in the first product line:

1. Authentication and server environment selection
2. Personal task workbench
3. Task list with search, status filters, and priority grouping
4. Task details with comments, status transitions, and photo evidence
5. Map handoff and nearby context
6. Chat inbox and conversation view
7. Profile, device state, and lightweight settings

Deferred from portal / current app:

- analytics dashboards
- finance
- user and organization management
- full admin settings
- broad notification center
- complex calendar workflows
- support back office screens

## Navigation Model

Primary navigation for the new app:

- Workbench
- Map
- Chat
- Profile

Key change versus the current Android app:

- the worker lands in Workbench instead of Map
- task details become the central execution surface
- map is supporting context and route handoff, not the home screen

## Target Architecture

The new branch is created as a separate KMP project inside the repository:

```text
mobile-next/
  composeApp/          # shared Compose UI + Android app entry + iOS framework entry
  core/
    designsystem/      # theme, tokens, reusable UI primitives
  domain/              # pure Kotlin models, repository contracts, use cases
  data/                # repository implementations, DTOs, mappers, remote/local data sources
  iosApp/              # Xcode host app, created on macOS in the next phase
```

Dependency rules:

- `composeApp -> core:designsystem, domain, data`
- `data -> domain`
- `domain -> nothing platform specific`
- `core:designsystem -> no business logic`

## Delivery Plan

### Phase 1: Foundation

- create isolated KMP scaffold in `mobile-next/`
- define shared task domain
- build modern theme and app shell
- implement task workbench as the first vertical slice

### Phase 2: Execution Flows

- authentication
- real task repository via portal APIs
- task details, comments, and status changes
- offline-first sync contract for mobile-critical actions

Current implementation status inside `mobile-next`:

- shared `domain` and `data` modules are active
- in-memory repositories keep the new product line independently testable
- the portal auth/task backend contract is now captured in `data/remote`
- remote session/task repositories are shaped against the new domain API and are ready for a concrete HTTP client

### Phase 3: Operational Flows

- chat
- route handoff and map context
- push notifications and deep links
- profile and device diagnostics

### Phase 4: iOS Delivery

- create and sign `iosApp` host on macOS
- validate shared UI/performance on real iPhone targets
- add platform-specific integrations where shared code is not enough

## Technical Notes

- The new branch is intentionally isolated from the current Android app so we can evolve Kotlin/Compose Multiplatform versions without destabilizing production.
- Android can be assembled from the current Windows environment.
- iOS host build and simulator/device verification require macOS with Xcode, which is the next execution phase once the shared foundation is stable.
- In the current repository state, the shared `domain` and `data` foundation is the wired part of `mobile-next`, including a dedicated remote contract for `api/auth` and `api/tasks`.
- The `composeApp` and `core/designsystem` draft is kept in the branch as the next layer, but it is not yet connected to the nested build because the required Compose Multiplatform artifacts are not available from the current environment.
