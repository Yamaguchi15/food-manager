import { useEffect, useMemo, useState } from "react";
import "./App.css";

function App() {
  const [name, setName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem("food-items");
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem("food-items", JSON.stringify(items));
  }, [items]);

  const sortedItems = useMemo(() => {
    return [...items].sort(
      (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
    );
  }, [items]);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name.trim() || !expiryDate) {
      alert("食材名と賞味期限を入力してください。");
      return;
    }

    const newItem = {
      id: crypto.randomUUID(),
      name: name.trim(),
      expiryDate,
    };

    setItems((prev) => [...prev, newItem]);
    setName("");
    setExpiryDate("");
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const getDaysLeft = (dateString) => {
    const today = new Date();
    const target = new Date(dateString);

    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    const diffMs = target - today;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="app">
      <div className="container">
        <header className="header">
          <h1>Food Manager</h1>
          <p>食材の賞味期限をシンプルに管理するアプリ</p>
        </header>

        <section className="card">
          <h2>食材を追加</h2>
          <form onSubmit={handleSubmit} className="form">
            <div className="form-group">
              <label htmlFor="name">食材名</label>
              <input
                id="name"
                type="text"
                placeholder="例: 牛乳"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="expiryDate">賞味期限</label>
              <input
                id="expiryDate"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>

            <button type="submit" className="submit-button">
              追加する
            </button>
          </form>
        </section>

        <section className="card">
          <h2>食材一覧</h2>

          {sortedItems.length === 0 ? (
            <p className="empty">まだ食材が登録されていません。</p>
          ) : (
            <ul className="item-list">
              {sortedItems.map((item) => {
                const daysLeft = getDaysLeft(item.expiryDate);

                return (
                  <li key={item.id} className="item">
                    <div>
                      <h3>{item.name}</h3>
                      <p>賞味期限: {item.expiryDate}</p>
                      <p
                        className={
                          daysLeft < 0
                            ? "expired"
                            : daysLeft <= 3
                            ? "warning"
                            : "safe"
                        }
                      >
                        {daysLeft < 0
                          ? `${Math.abs(daysLeft)}日期限切れ`
                          : daysLeft === 0
                          ? "今日まで"
                          : `あと${daysLeft}日`}
                      </p>
                    </div>

                    <button
                      className="delete-button"
                      onClick={() => handleDelete(item.id)}
                    >
                      削除
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

export default App;