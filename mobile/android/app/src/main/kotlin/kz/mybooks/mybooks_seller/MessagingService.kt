package kz.mybooks.mybooks_seller

import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/** Приём push FCM (сервер шлёт только data): уведомление рисуем сами — с тегом по ссылке CRM. */
class MessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(message: RemoteMessage) {
        val d = message.data
        val title = d["title"] ?: return
        val link = d["link"] ?: ""
        // Тег — ссылка: все уведомления об одном чате — одна строка в шторке, открыли чат — она убирается.
        Push.show(this, title, d["body"] ?: "", link, link.ifEmpty { d["tag"] ?: "" })
    }

    override fun onNewToken(token: String) {
        // Новый токен приложение отправит на сервер при следующем открытии (оно запрашивает токен при каждом входе).
    }
}
