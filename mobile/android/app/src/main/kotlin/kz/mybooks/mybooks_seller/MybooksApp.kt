package kz.mybooks.mybooks_seller

import io.flutter.app.FlutterApplication

/** Firebase поднимается при старте процесса из сохранённых данных проекта: push приходят и при закрытом приложении. */
class MybooksApp : FlutterApplication() {
    override fun onCreate() {
        super.onCreate()
        Push.init(this)
    }
}
