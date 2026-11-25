package kz.mybooks.mybooks_seller

import android.content.Intent
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.messaging.FirebaseMessaging
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

/**
 * Мост push для Android (тот же канал, что у iPhone): Dart передаёт данные проекта Firebase, полученные с сервера CRM,
 * нативная часть поднимает Firebase и отдаёт токен FCM; нажатие на уведомление передаёт ссылку CRM, по которой Dart
 * открывает диалог или сделку; прочитанный чат убирается из шторки по тегу.
 */
class MainActivity : FlutterActivity() {
    private var channel: MethodChannel? = null
    private var launchLink: String? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        launchLink = intent?.getStringExtra(Push.EXTRA_LINK)
        val ch = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "kz.mybooks.mybooksSeller/push")
        ch.setMethodCallHandler { call, result ->
            when (call.method) {
                "register" -> {
                    if (FirebaseApp.getApps(this).isEmpty()) {
                        result.success(null)
                        return@setMethodCallHandler
                    }
                    try {
                        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                            if (task.isSuccessful && task.result != null) ch.invokeMethod("token", task.result)
                            else ch.invokeMethod("error", task.exception?.message ?: "token")
                        }
                        result.success(null)
                    } catch (e: Exception) {
                        result.error("fcm", e.message, null)
                    }
                }
                "registerAndroid" -> {
                    @Suppress("UNCHECKED_CAST")
                    val o = call.arguments as? Map<String, String>
                    if (o == null || !Push.configure(this, o)) {
                        result.error("config", "Нет данных Firebase", null)
                        return@setMethodCallHandler
                    }
                    try {
                        FirebaseMessaging.getInstance().token.addOnCompleteListener { task ->
                            if (task.isSuccessful && task.result != null) ch.invokeMethod("token", task.result)
                            else ch.invokeMethod("error", task.exception?.message ?: "token")
                        }
                        result.success(null)
                    } catch (e: Exception) {
                        result.error("fcm", e.message, null)
                    }
                }
                "initialLink" -> {
                    result.success(launchLink)
                    launchLink = null
                }
                "clear" -> {
                    val tag = call.arguments as? String
                    if (tag != null) NotificationManagerCompat.from(this).cancel(tag, Push.NOTIFICATION_ID)
                    result.success(null)
                }
                "clearAll" -> {
                    NotificationManagerCompat.from(this).cancelAll()
                    result.success(null)
                }
                else -> result.notImplemented()
            }
        }
        channel = ch
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val link = intent.getStringExtra(Push.EXTRA_LINK) ?: return
        channel?.invokeMethod("open", link)
    }
}
