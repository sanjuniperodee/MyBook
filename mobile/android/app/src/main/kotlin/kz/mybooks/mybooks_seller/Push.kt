package kz.mybooks.mybooks_seller

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import com.google.firebase.FirebaseApp
import com.google.firebase.FirebaseOptions

/**
 * Push на Android без google-services.json: данные проекта Firebase (apiKey, appId, projectId, senderId) сервер CRM
 * отдаёт приложению (/api/mobile/push), они сохраняются на телефоне — так ключ можно добавить на сервер без пересборки.
 */
object Push {
    const val EXTRA_LINK = "crm_link"
    const val NOTIFICATION_ID = 1
    private const val PREFS = "mybooks_push"
    private const val CHANNEL = "crm"

    fun init(context: Context) {
        val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val appId = p.getString("appId", null) ?: return
        start(context, p.getString("apiKey", "")!!, appId, p.getString("projectId", "")!!, p.getString("senderId", "")!!)
    }

    /** Сохранить данные проекта и поднять Firebase. false — данных не хватает. */
    fun configure(context: Context, o: Map<String, String>): Boolean {
        val apiKey = o["apiKey"] ?: return false
        val appId = o["appId"] ?: return false
        val projectId = o["projectId"] ?: return false
        val senderId = o["senderId"] ?: ""
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putString("apiKey", apiKey).putString("appId", appId).putString("projectId", projectId).putString("senderId", senderId).apply()
        return start(context, apiKey, appId, projectId, senderId)
    }

    private fun start(context: Context, apiKey: String, appId: String, projectId: String, senderId: String): Boolean {
        if (FirebaseApp.getApps(context).isNotEmpty()) return true
        return try {
            val options = FirebaseOptions.Builder().setApiKey(apiKey).setApplicationId(appId).setProjectId(projectId).setGcmSenderId(senderId).build()
            FirebaseApp.initializeApp(context, options)
            true
        } catch (e: Exception) {
            false
        }
    }

    /** Уведомление CRM: тег — ссылка (один чат — одно уведомление, прочитанный убирается), нажатие открывает приложение со ссылкой. */
    fun show(context: Context, title: String, body: String, link: String, tag: String) {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm.getNotificationChannel(CHANNEL) == null) {
            nm.createNotificationChannel(NotificationChannel(CHANNEL, "CRM", NotificationManager.IMPORTANCE_HIGH).apply { description = "Сообщения клиентов, задачи и напоминания" })
        }
        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra(EXTRA_LINK, link)
        }
        val pending = PendingIntent.getActivity(context, (tag.ifEmpty { link }).hashCode(), intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_notify)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setContentIntent(pending)
            .build()
        try {
            NotificationManagerCompat.from(context).notify(tag.ifEmpty { link.ifEmpty { title } }, NOTIFICATION_ID, n)
        } catch (e: SecurityException) {
            // Нет разрешения на уведомления — приложение попросит его при следующем открытии.
        }
    }
}
