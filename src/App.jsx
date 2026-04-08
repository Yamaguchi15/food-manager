import { useEffect, useMemo, useState } from "react";
import { createWorker } from "tesseract.js";
import "./App.css";

function App() {
  const [name, setName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [memo, setMemo] = useState("");

  const [items, setItems] = useState(() => {
    const saved = localStorage.getItem("food-items");
    return saved ? JSON.parse(saved) : [];
  });

  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState("");
  const [ocrText, setOcrText] = useState("");
  const [isOcrLoading, setIsOcrLoading] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");

  useEffect(() => {
    localStorage.setItem("food-items", JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);

    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [imageFile]);

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
      memo: memo.trim(),
    };

    setItems((prev) => [...prev, newItem]);
    setName("");
    setExpiryDate("");
    setMemo("");
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleImageChange = (e) => {
    const file = e.target.files?.[0] || null;
    setImageFile(file);
    setOcrText("");
    setOcrStatus("");
  };

  const handleRunOcr = async () => {
    if (!imageFile) {
      alert("先に画像を選択してください。");
      return;
    }

    setIsOcrLoading(true);
    setOcrText("");
    setOcrStatus("OCRを開始しています...");

    let worker;

    try {
      worker = await createWorker("jpn+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrStatus(`文字を読み取り中... ${Math.round(m.progress * 100)}%`);
          } else {
            setOcrStatus(m.status);
          }
        },
      });

      const result = await worker.recognize(imageFile);
      setOcrText(result.data.text || "");
      setOcrStatus("OCRが完了しました。");
    } catch (error) {
      console.error(error);
      setOcrStatus("OCRに失敗しました。画像を変えて再試行してください。");
    } finally {
      if (worker) {
        await worker.terminate();
      }
      setIsOcrLoading(false);
    }
  };

  const handleUseOcrText = () => {
    if (!ocrText.trim()) {
      alert("OCR結果がありません。");
      return;
    }

    const firstLine = ocrText
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0);

    if (!firstLine) {
      alert("使えそうな文字列が見つかりませんでした。");
      return;
    }

    setName(firstLine);
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
          <h2>画像から文字を読み取る</h2>

          <div className="image-upload-area">
            <label htmlFor="foodImage" className="file-label">
              画像を選択
            </label>

            <input
              id="foodImage"
              type="file"
              accept="image/*"
              onChange={handleImageChange}
              className="file-input"
            />

            {imageFile && <p className="file-name">選択中: {imageFile.name}</p>}

            {imagePreview ? (
              <div className="preview-box">
                <img
                  src={imagePreview}
                  alt="選択した画像のプレビュー"
                  className="preview-image"
                />
              </div>
            ) : (
              <p className="empty">まだ画像が選択されていません。</p>
            )}

            <button
              type="button"
              className="submit-button"
              onClick={handleRunOcr}
              disabled={isOcrLoading}
            >
              {isOcrLoading ? "OCR実行中..." : "OCRを実行"}
            </button>

            {ocrStatus && <p className="status-text">{ocrStatus}</p>}

            <div className="ocr-result-box">
              <div className="ocr-result-header">
                <h3>OCR結果</h3>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={handleUseOcrText}
                >
                  1行目を食材名に使う
                </button>
              </div>

              {ocrText ? (
                <textarea
                  className="ocr-textarea"
                  value={ocrText}
                  onChange={(e) => setOcrText(e.target.value)}
                />
              ) : (
                <p className="empty">まだOCR結果がありません。</p>
              )}
            </div>
          </div>
        </section>

        <section className="card">
          <h2>食材を手動で追加</h2>

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

            <div className="form-group">
              <label htmlFor="memo">メモ</label>
              <input
                id="memo"
                type="text"
                placeholder="例: 冷蔵庫上段、開封済み"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
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
                      {item.memo && <p>メモ: {item.memo}</p>}
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