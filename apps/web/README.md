# PowderTwin Web Prototype

Статический прототип интерфейса цифрового двойника линии порошковой краски.

Запуск:

```powershell
python -m http.server 5173 --directory apps/web
```

Затем открыть `http://localhost:5173`.

Прототип работает без backend и внешних библиотек. Для простого деплоя MVP сейчас собран как standalone `index.html`; файлы `app.js` и `styles.css` оставлены как точки расширения для следующего этапа.
