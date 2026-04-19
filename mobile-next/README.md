# Mobile Next

Current status:

- `domain/` and `data/` are the active shared foundation for the new mobile branch.
- `composeApp/` and `core/designsystem/` contain the draft standalone UI shell for the new app.
- `iosApp/` is reserved for the native host app that will be created on macOS.
- `gradlew`, `gradlew.bat`, and `gradle/wrapper/` are local to `mobile-next/`, so this project can be run as an isolated application workspace.

Active vertical slices:

- session and environment selection
- workbench task board
- task detail, comments, and status transitions
- in-memory repositories for standalone development
- portal auth/task remote contract and repository adapters

Why the nested build currently wires only shared modules:

- the local environment can configure and run the existing root Gradle build
- the isolated nested build cannot currently resolve the additional Compose Multiplatform artifacts needed for the new UI layer
- because of that, the first safe step was to land the new architecture, shared models, repository contract, use case, and seed data without destabilizing the current production app

Immediate next step:

1. bind the new `data/remote` contract to a concrete HTTP client and token persistence
2. restore artifact access for the nested KMP/Compose build so the UI layer can consume the remote repositories

Run from this folder:

```powershell
cd mobile-next
.\gradlew.bat tasks
```

Constraint:

- development of the new application stays inside `mobile-next/`
- the production Android client in `app/` is not connected to this project and should not be edited as part of this branch
