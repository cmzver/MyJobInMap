import re

path = r"c:\Users\VADIM\Documents\MyJobInMap\app\src\main\java\com\fieldworker\ui\main\MainScreen.kt"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

# Replace the signature
sig_pattern = r"(notificationTaskId: Long\? = null,\s*onNotificationTaskHandled: \(\) -> Unit = \{\},)"
sig_replacement = "\\1\n    notificationChatId: Long? = null,\n    onNotificationChatHandled: () -> Unit = {},"
content = re.sub(sig_pattern, sig_replacement, content, count=1)

# Replace the LaunchedEffect block
effect_pattern = r"(onNotificationTaskHandled\(\)\s*\}\s*)\n\s*Scaffold\("
effect_replacement = "\\1\n    LaunchedEffect(notificationChatId) {\n        val chatId = notificationChatId ?: return@LaunchedEffect\n        navController.navigate(Screen.Chat.route) {\n            popUpTo(navController.graph.findStartDestination().id) {\n                saveState = true\n            }\n            launchSingleTop = true\n            restoreState = true\n        }\n        chatViewModel.openConversation(chatId)\n        onNotificationChatHandled()\n    }\n    \n    Scaffold("
content = re.sub(effect_pattern, effect_replacement, content, count=1)

with open(path, "w", encoding="utf-8") as f:
    f.write(content)

print("MainScreen updated")
