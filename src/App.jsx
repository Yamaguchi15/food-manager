import { useEffect, useMemo, useState, useRef } from "react";
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

  const workerRef = useRef(null);

  // LocalStorage保存
  useEffect(() => {
    localStorage.setItem("food-items", JSON.stringify(items));
  }, [items]);

  // 画像プレビュー
  useEffect(() => {
    if (!imageFile) {
      setImagePreview("");
      return;
    }

    const objectUrl = URL.createObjectURL(imageFile);
    setImagePreview(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [imageFile]);

  // OCR worker初期化（1回だけ）
  useEffect(() => {
    const initWorker = async () => {
      setOcrStatus("OCRエンジン準備中...");
      workerRef.current = await createWorker("jpn+eng", 1, {
        logger: (m) => {
          if (m.status === "recognizing text") {
            setOcrStatus(`読み取り中... ${Math.round(m.progress * 100)}%`);
          }
        },
      });
      setOcrStatus("OCR準備完了");
    };

    initWorker();

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  // OCR実行
  const handleRunOcr = async () => {
    if (!imageFile) {
      alert("先に画像を選択してください");
      return;
    }

    if (!workerRef.current) {
      alert("OCR準備中です。少し待ってください");
      return;
    }

    setIsOcrLoading(true);
    setOcrText("");

    try {
      const result = await workerRef.current.recognize(imageFile);
      setOcrText(result.data.text || "");
      setOcrStatus("OCR完了");
    } catch (e) {
      console.error(e);
      setOcrStatus("OCR失敗");
    } finally {
      setIsOcrLoading(false);
    }
  };

  // OCR → 食材候補抽出
  const candidateFoods = useMemo(() => {
    if (!ocrText.trim()) return [];

    return ocrText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 2)
      .filter((line) => !/[0-9]{2,}/.test(line))
      .filter((line) => !line.includes("¥"))
      .filter((line) => !line.includes("円"))
      .filter((line) => !line.includes("TEL"))
      .filter((line) => !line.includes("合計"))
      .filter((line) => !line.includes("税"))
      .filter((line) => !line.includes("レシート"))
      .filter((line) => !/^\d+$/.test(line))
      .filter((line, i, arr) => arr.indexOf(line) === i)
      .slice(0, 10);
  }, [ocrText]);

  const handleSelectCandidate = (c) => {
    setName(c);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name || !expiryDate) {
      alert("入力してください");
      return;
    }

    const newItem = {
      id: crypto.randomUUID(),
      name,
      expiryDate,
      memo,
    };

    setItems((prev) => [...prev, newItem]);
    setName("");
    setExpiryDate("");
    setMemo("");
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const sortedItems = useMemo(() => {
    return [...items].sort(
      (a, b) => new Date(a.expiryDate) - new Date(b.expiryDate)
    );
  }, [items]);

  const getDaysLeft = (date) => {
    const today = new Date();
    const target = new Date(date);

    today.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);

    return Math.ceil((target - today) / (1000 * 60 * 60 * 24));
  };

  return (
    <div className="app">
      <div className="container">
        <h1>Food Manager</h1>

        <section className="card">
          <h2>OCR</h2>

          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />

          <button onClick={handleRunOcr}>
            {isOcrLoading ? "解析中..." : "OCR実行"}
          </button>

          <p>{ocrStatus}</p>

          {ocrText && (
            <textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
            />
          )}

          {candidateFoods.length > 0 && (
            <div>
              <h3>候補</h3>
              {candidateFoods.map((c) => (
                <button key={c} onClick={() => handleSelectCandidate(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="card">
          <h2>追加</h2>

          <form onSubmit={handleSubmit}>
            <input
              placeholder="食材名"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />

            <input
              type="date"
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />

            <input
              placeholder="メモ"
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
            />

            <button type="submit">追加</button>
          </form>
        </section>

        <section className="card">
          <h2>一覧</h2>

          {sortedItems.map((item) => {
            const days = getDaysLeft(item.expiryDate);

            return (
              <div key={item.id}>
                <h3>{item.name}</h3>
                <p>{item.expiryDate}</p>
                <p>
                  {days < 0
                    ? "期限切れ"
                    : days === 0
                    ? "今日"
                    : `${days}日`}
                </p>

                <button onClick={() => handleDelete(item.id)}>削除</button>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export default App;