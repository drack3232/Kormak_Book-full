
const express = require("express");
const mysql = require("mysql2");
const cors = require("cors");
require('dotenv').config();
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
//const { use } = require("react");
const SECRET = "supersecret"; 
const app = express();

app.use(express.json());
app.use(cors());
app.get("/test", (req, res) => res.send("СЕРВЕР УСПІШНО ПЕРЕЗАПУЩЕНО!"));
// Підключення до MySQL
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "password",
  database: "library_online"
});

db.connect(err => {
  if (err) {
    console.error("Помилка з'єднання з MySQL:", err);
    return;
  }
  console.log("✅ Підключено до MySQL");
});

// ==================== MIDDLEWARE ====================
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Токен відсутній' });
  }

  jwt.verify(token, SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Токен недійсний' });
    }
    req.user = user;
    next();
  });
};

// ==================== АВТЕНТИФІКАЦІЯ ====================
app.post("/register", (req, res) => {
  const { name, email, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);
  db.query("INSERT INTO users (name, email, password) VALUES (?, ?, ?)",
    [name, email, hashedPassword],
    (err, result) => {
      if (err) return res.status(500).json({ error: err });
      res.json({ message: "✅ Користувача зареєстровано!" });
    }
  );
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;
  db.query("SELECT * FROM users WHERE email = ?", [email], (err, users) => {
    if (err) return res.status(500).json({ error: err });
    if (users.length === 0) return res.status(400).json({ error: "❌ Користувач не знайдений" });
    const user = users[0];
    if (!bcrypt.compareSync(password, user.password)) {
      return res.status(400).json({ error: "❌ Невірний пароль" });
    }
    const token = jwt.sign({ id: user.id }, SECRET, { expiresIn: "1h" });
    res.json({ message: "✅ Вхід успішний", token, user: { id: user.id, name: user.name, email: user.email } });
  });
});

// ==================== ОСОБИСТИЙ КАБІНЕТ ====================
app.get("/profile", authenticateToken, (req, res) =>{
  const userID = req.user.id;
  const sqlQuery = "SELECT id, name, email FROM users WHERE id=?"

  db.query(sqlQuery, [userID], (err, users)=>{
    if (err){
      console.error("Error receiving profile:", err);
      return res.status(500).json({error:"Server's error "});
    
  }
  if(users.length ===0){
    return res.status(404).json({error: "User not found"})
  }
res.json(users[0])
  })
})



// ==================== КОШИК ====================

app.post("/cart/:userID/add", authenticateToken, (req, res) => {
  console.log("✅✅✅ ЗАПИТ НА /cart/add БУЛО УСПІШНО ОТРИМАНО! ✅✅✅");
  const { bookId } = req.body;
  const userId = req.user.id;

  db.query("INSERT INTO cart (user_id, book_id) VALUES (?, ?)", [userId, bookId], (err) => {
    if (err) return res.status(500).json({ error: err });
    res.json({ message: "✅ Додано у кошик" });
  });
});

// ... (твій app.post("/cart/add", ...) тут) ...

// ❗️ ДОДАЙ ЦЕЙ НОВИЙ МАРШРУТ
app.post("/cart/:userID/remove", authenticateToken, (req, res) => {
  const { bookId } = req.body;
  const userId = req.user.id;

  // Потрібно перевірити, чи bookId існує
  if (!bookId) {
    return res.status(400).json({ error: "Не вказано ID книги" });
  }

  // Видаляємо ОДИН запис (якщо в кошику 3 однакових книги, це видалить одну)
  // Якщо хочеш видалити всі - зміни SQL на "DELETE FROM cart WHERE ..."
  const sql = "DELETE FROM cart WHERE user_id = ? AND book_id = ? LIMIT 1";

  db.query(sql, [userId, bookId], (err, result) => {
    if (err) {
      console.error("Помилка видалення з кошика:", err);
      return res.status(500).json({ error: "Помилка сервера" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Цю книгу не знайдено в кошику" });
    }
    res.json({ message: "✅ Видалено з кошика" });
  });
});



app.get("/cart/:userId", authenticateToken, (req, res) => {
  const userId = req.params.userId;
   
  // Перевіряємо, чи користувач має доступ до цього кошика
  if (req.user.id != userId) {
    return res.status(403).json({ error: "Доступ заборонено" });
  }

  db.query(
    "SELECT books.* FROM cart JOIN books ON cart.book_id = books.id WHERE cart.user_id = ?",
    [userId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results);
    }
  );
});

// ==================== БІБЛІОТЕКА (WISHLIST) ====================
app.get("/api/wishlist", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = "SELECT book_id FROM wishlist WHERE user_id = ?";

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Помилка отримання бажаного:", err);
      return res.status(500).json({ error: "Помилка сервера" });
    }
    // Повертаємо просто масив ID: [1, 5, 12]
    const wishlistIds = results.map(item => item.book_id);
    res.json(wishlistIds);
  });
});

// ДОДАТИ КНИГУ В БІБЛІОТЕКУ
app.post("/api/wishlist", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.body;

  if (!bookId) {
    return res.status(400).json({ error: "Не вказано ID книги" });
  }

  const sql = "INSERT INTO wishlist (user_id, book_id) VALUES (?, ?)";

  db.query(sql, [userId, bookId], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.json({ message: 'Книга вже була додана' });
      }
      console.error("Помилка додавання до бажаного:", err);
      return res.status(500).json({ error: "Помилка сервера" });
    }
    res.status(201).json({ message: "Книгу додано до бібліотеки" });
  });
});

// ВИДАЛИТИ КНИГУ З БІБЛІОТЕКИ
app.delete("/api/wishlist/:bookId", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const { bookId } = req.params;
  const sql = "DELETE FROM wishlist WHERE user_id = ? AND book_id = ?";

  db.query(sql, [userId, bookId], (err, result) => {
    if (err) {
      console.error("Помилка видалення з бажаного:", err);
      return res.status(500).json({ error: "Помилка сервера" });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Книгу не знайдено в бібліотеці" });
    }
    res.json({ message: "Книгу видалено з бібліотеки" });
  });
});
console.log("!!! WISHLIST ROUTES DEFINED !!!")

// Отримати повні дані книг для сторінки "Моя Бібліотека"
app.get("/api/wishlist/books", authenticateToken, (req, res) => {
  const userId = req.user.id;
  const sql = "SELECT b.id, b.title, b.author, b.cover_url, b.genre FROM books b JOIN wishlist w ON b.id = w.book_id WHERE w.user_id = ?";

  db.query(sql, [userId], (err, results) => {
    if (err) {
      console.error("Помилка отримання книг з бібліотеки:", err);
      return res.status(500).json({ error: "Помилка сервера" });
    }
    // Повертаємо масив повних об'єктів книг
    res.json(results);
  });
});
// ==================== ОСНОВНІ ЕНДПОІНТИ КНИГ ====================

// Отримати ВСІ книги (з фільтром по жанру)
app.get("/books", (req, res) => {
  // Перевіряємо, чи є в запиті параметр 'genre'
  const genre = req.query.genre;

  let sqlQuery = "SELECT * FROM books";
  const params = [];

  // Якщо жанр вказано, додаємо умову до SQL-запиту
  if (genre) {
    sqlQuery += " WHERE genre = ?";
    params.push(genre);
  }

  db.query(sqlQuery, params, (err, results) => {
    if (err) {
      console.error("ПОМИЛКА ЗАПИТУ ДО БАЗИ ДАНИХ:", err);
      return res.status(500).json(err);
    }
    res.json(results);
  });
});

// Додати нову книгу
app.post("/books", (req, res) => {
  const { title, author, year, genre, description, cover_url } = req.body;
  db.query(
    "INSERT INTO books (title, author, year, genre, description, cover_url) VALUES (?, ?, ?, ?, ?, ?)",
    [title, author, year, genre, description, cover_url],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Книга додана!" });
    }
  );
});


// === ВИПРАВЛЕНИЙ ПОРЯДОК: БЛОК 1 - КОНКРЕТНІ МАРШРУТИ ===

// Популярні книги
app.get("/books/popular", (req, res) => {
  db.query(
   "SELECT * FROM books ORDER BY id DESC LIMIT 4",
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results);
    }
  );
});

// Отримання унікальних жанрів
app.get("/books/genres", (req, res) => {
  db.query(
    "SELECT DISTINCT genre FROM books WHERE genre IS NOT NULL AND genre != '' ORDER BY genre", 
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      res.json(results.map(row => row.genre));
    }
  );
});

// Розширений пошук
app.get("/books/search/advanced", (req, res) => {
  const { query, genre, yearFrom, yearTo, minRating, sortBy = 'title' } = req.query;
  
  let sql = "SELECT * FROM books WHERE 1=1";
  let params = [];

  if (query && query.trim() !== '') {
    sql += " AND (title LIKE ? OR author LIKE ? OR description LIKE ?)";
    const searchTerm = `%${query.trim()}%`;
    params.push(searchTerm, searchTerm, searchTerm);
  }
  
  if (genre && genre !== 'all') {
    sql += " AND genre = ?";
    params.push(genre);
  }
  
  if (yearFrom && !isNaN(yearFrom)) {
    sql += " AND year >= ?";
    params.push(parseInt(yearFrom));
  }
  
  if (yearTo && !isNaN(yearTo)) {
    sql += " AND year <= ?";
    params.push(parseInt(yearTo));
  }
  
  if (minRating && !isNaN(minRating)) {
    sql += " AND rating >= ?";
    params.push(parseFloat(minRating));
  }

  // Сортування
  const sortOptions = {
    'title': 'title ASC',
    'rating': 'rating DESC',
    'year': 'year DESC',
    'reviews': 'reviews_count DESC'
  };
  
  sql += ` ORDER BY ${sortOptions[sortBy] || 'title ASC'}`;

  db.query(sql, params, (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// === ПЕРЕВІР, ЧИ Є ЦЕЙ МАРШРУТ ===
app.get("/books/search", (req, res) => {
  const query = req.query.q; // Беремо пошуковий запит з параметра ?q=...

  // Перевірка, чи запит не порожній
  if (!query || query.trim() === '') {
    return res.json([]); // Якщо запит порожній, повертаємо порожній масив
  }

  // Шукаємо книги, де назва АБО автор містять запит (LIKE '%query%')
  const sql = "SELECT * FROM books WHERE title LIKE ? OR author LIKE ?";
  const searchTerm = `%${query.trim()}%`; // Додаємо % для пошуку будь-де у рядку

  db.query(sql, [searchTerm, searchTerm], (err, results) => {
    if (err) {
      console.error("Помилка пошуку книг:", err);
      return res.status(500).json({ error: "Помилка сервера під час пошуку" });
    }
    res.json(results); // Повертаємо знайдені книги
  });
});

// === ВИПРАВЛЕНИЙ ПОРЯДОК: БЛОК 2 - БІЛЬШ КОНКРЕТНІ ДИНАМІЧНІ МАРШРУТИ ===

// Оновлення рейтингу книги (допоміжна функція)
const updateBookRating = (bookId) => {
  db.query(
    "SELECT AVG(rating) as avgRating, COUNT(*) as count FROM reviews WHERE book_id = ?",
    [bookId],
    (err, results) => {
      if (!err && results[0].avgRating) {
        const avgRating = parseFloat(results[0].avgRating).toFixed(2);
        const reviewsCount = results[0].count;
        
        db.query(
          "UPDATE books SET rating = ?, reviews_count = ? WHERE id = ?", 
          [avgRating, reviewsCount, bookId],
          (updateErr) => {
            if (updateErr) console.error("Помилка оновлення рейтингу:", updateErr);
          }
        );
      }
    }
  );
};

// Додавання відгуку
app.post("/books/:id/review", authenticateToken, (req, res) => {
  
  const { rating, comment } = req.body;
  const bookId = req.params.id;
  const userId = req.user.id;

  // Перевіряємо, чи користувач вже залишав відгук
  db.query(
    "SELECT id FROM reviews WHERE user_id = ? AND book_id = ?",
    [userId, bookId],
    (err, results) => {
      if (err) return res.status(500).json({ error: err });
      
      if (results.length > 0) {
        return res.status(400).json({ error: "Ви вже залишили відгук для цієї книги" });
      }

      // Додаємо новий відгук
      db.query(
        "INSERT INTO reviews (user_id, book_id, rating, comment) VALUES (?, ?, ?, ?)",
        [userId, bookId, rating, comment],
        (insertErr) => {
          if (insertErr) return res.status(500).json({ error: insertErr });
          
          // Оновлюємо рейтинг книги
          updateBookRating(bookId);
          res.json({ message: "Відгук додано!" });
        }
      );
    }
  );
});

// Отримання відгуків для книги
app.get("/books/:id/reviews", (req, res) => {
  const bookId = req.params.id;
  
  // === ОНОВЛЕНИЙ ЧИСТИЙ ЗАПИТ ===
  const query = "SELECT r.rating, r.comment, u.name as user_name FROM reviews r JOIN users u ON r.user_id = u.id WHERE r.book_id = ? ORDER BY r.id DESC";
  
  db.query(query, [bookId], (err, results) => {
    if (err) {
        // Ми можемо залишити лог, він корисний
        console.error("!!! ПОМИЛКА SQL В /books/:id/reviews:", err); 
        return res.status(500).json({ error: err });
    }
    res.json(results);
  });
});

// === НОВИЙ МАРШРУТ: ОТРИМАТИ КНИГИ, ЗГРУПОВАНІ ЗА ЖАНРОМ ===
app.get("/books/by-genre", (req, res) => {
  // 1. Беремо всі книги, які мають жанр, сортуємо за жанром
  const sql = "SELECT * FROM books WHERE genre IS NOT NULL AND genre != '' ORDER BY genre, id DESC";
  
  db.query(sql, (err, results) => {
    if (err) {
      console.error("Помилка отримання книг за жанром:", err);
      return res.status(500).json({ error: "Помилка сервера" });
    }

    // 2. Магія: Групуємо плаский масив у об'єкт
    const groupedBooks = {};
    for (const book of results) {
      const genre = book.genre;
      
      // Якщо такого жанру в нашому об'єкті ще немає, створюємо для нього порожній масив
      if (!groupedBooks[genre]) {
        groupedBooks[genre] = [];
      }
      
      // 3. Додаємо книгу в масив її жанру (але не більше 10, щоб не перевантажувати)
      if (groupedBooks[genre].length < 10) {
        groupedBooks[genre].push(book);
      }
    }
    
    // 4. Відправляємо готовий об'єкт
    res.json(groupedBooks);
  });
});

// === КІНЕЦЬ НОВОГО МАРШРУТУ ===

// === ВИПРАВЛЕНИЙ ПОРЯДОК: БЛОК 3 - ЗАГАЛЬНІ ДИНАМІЧНІ МАРШРУТИ ===

// Оновити книгу
app.put("/books/:id", (req, res) => {
  const id = req.params.id;
  const { title, author, year, genre, description, cover_url } = req.body;
  db.query(
    "UPDATE books SET title = ?, author = ?, year = ?, genre = ?, description = ?, cover_url = ? WHERE id = ?",
    [title, author, year, genre, description, cover_url, id],
    (err, results) => {
      if (err) return res.status(500).json(err);
      res.json({ message: "Книгу оновлено!" });
    }
  );
});

// Видалити книгу
app.delete("/books/:id", (req, res) => {
  const id = req.params.id;
  db.query("DELETE FROM books WHERE id = ?", [id], (err, results) => {
    if (err) return res.status(500).json(err);
    res.json({ message: "Книгу видалено!" });
  });
});

// Отримати одну книгу за id
app.get("/books/:id", (req, res) => {
  const bookId = req.params.id;
  // Додаємо лог для перевірки
  console.log("--- ОТРИМАНО ЗАПИТ НА ID КНИГИ:", bookId, " (тип:", typeof bookId, ")");
  const sqlQuery = "SELECT * FROM books WHERE id = ?";

  db.query(sqlQuery, [bookId], (err, results) => {
    if (err) {
      return res.status(500).json({ error: "Помилка сервера" });
    }
    if (results.length === 0) {
      return res.status(404).json({ error: "Книгу не знайдено" });
    }
    res.json(results[0]);
  });
});


// ==================== ІНШІ МАРШРУТИ ====================

// Рекомендації книг
app.get("/recommendations", authenticateToken, (req, res) => {
  const userId = req.user.id;
  
  const query = `
    SELECT DISTINCT b.*     FROM books b
    WHERE b.genre IN (
      SELECT DISTINCT genre FROM books 
      WHERE id IN (
        SELECT book_id FROM cart WHERE user_id = ?
      )
    )
    AND b.id NOT IN (
      SELECT book_id FROM cart WHERE user_id = ?
    )
    AND b.rating >= 3.5
    ORDER BY b.rating DESC 
    LIMIT 8
  `;
  
  db.query(query, [userId, userId], (err, results) => {
    if (err) return res.status(500).json({ error: err });
    res.json(results);
  });
});

// Статистика бібліотеки
app.get("/admin/stats", authenticateToken, (req, res) => {
  const statsQueries = {
    totalBooks: "SELECT COUNT(*) as count FROM books",
    totalUsers: "SELECT COUNT(*) as count FROM users", 
    totalReviews: "SELECT COUNT(*) as count FROM reviews",
    popularGenres: `
      SELECT genre, COUNT(*) as count 
      FROM books 
      WHERE genre IS NOT NULL 
      GROUP BY genre 
      ORDER BY count DESC 
      LIMIT 5
    `,
    topRatedBooks: `
      SELECT title, rating, reviews_count 
      FROM books 
      WHERE reviews_count > 0 
  S      ORDER BY rating DESC 
      LIMIT 5
    `
  };

  const stats = {};
  let completedQueries = 0;
  const totalQueries = Object.keys(statsQueries).length;

  Object.keys(statsQueries).forEach(key => {
    db.query(statsQueries[key], (err, results) => {
      if (err) {
        stats[key] = { error: err.message };
      } else {
        stats[key] = results;
      }
      
      completedQueries++;
      if (completedQueries === totalQueries) {
        res.json(stats);
      }
    });
  });
});

// ==================== СТАНДАРТНИЙ ЕНДПОІНТ ====================
app.get("/", (req, res) => {
  res.send("Арасака тавр готуйся");
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`🚀 Сервер запущено на http://localhost:${PORT}`));