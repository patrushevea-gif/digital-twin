# PowderTwin Web Prototype

Статический прототип интерфейса цифрового двойника линии порошковой краски как части цифрового завода.

Запуск:

```powershell
python -m http.server 5173 --directory .
```

Затем открыть `http://localhost:5173/apps/web/`.

Прототип работает без backend и внешних библиотек. Для простого деплоя MVP сейчас собран как standalone `index.html`; файлы `app.js` и `styles.css` оставлены как точки расширения для следующего этапа.
