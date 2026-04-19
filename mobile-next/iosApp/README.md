# iOS Host App

This folder is reserved for the native Xcode host application for `mobile-next`.

The shared KMP foundation already exposes `MainViewController()` from `composeApp`, so the next macOS phase is:

1. create `iosApp` in Xcode
2. connect it to the generated `FieldWorkerNext` framework
3. configure signing, bundle id, and deep links
4. validate performance and platform integrations on simulator and device
