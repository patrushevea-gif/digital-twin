# PowderTwin Web Prototype

Статический прототип интерфейса цифрового двойника линии порошковой краски.

Запуск:

```powershell
python -m http.server 5173 --directory apps/web
```

Затем открыть `http://localhost:5173`.

Прототип работает без backend и внешних библиотек. Данные встроены в `index.html`, а логика симуляции находится в `app.js`.
