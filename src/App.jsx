import { useEffect, useMemo, useState, useRef } from "react";
import { createWorker } from "tesseract.js";
import "./App.css";
import recipes from "./recipes";

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

    const NG_WORDS = [
      "tel",
      "合計",
      "小計",
      "税込",
      "税",
      "消費税",
      "レシート",
      "ポイント",
      "クレジット",
      "visa",
      "mastercard",
      "現金",
      "お預り",
      "釣銭",
      "担当",
      "レジ",
      "時刻",
      "日時",
      "店舗",
      "領収書",
    ];

    return ocrText
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length >= 2)
      .filter((line) => line.length <= 20)
      .filter((line) => !/[0-9]{3,}/.test(line))
      .filter((line) => !/^\d+$/.test(line))
      .filter((line) => !line.includes("¥"))
      .filter((line) => !line.includes("円"))
      .filter((line) => !line.includes("/"))
      .filter((line) => !line.includes(":"))
      .filter((line) => !line.includes("-"))
      .filter((line) => {
        const lower = line.toLowerCase();
        return !NG_WORDS.some((word) => lower.includes(word));
      })
      .filter((line, i, arr) => arr.indexOf(line) === i)
      .slice(0, 10);
  }, [ocrText]);

  const suggestedRecipes = useMemo(() => {
    if (items.length === 0) return [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const itemInfoList = items.map((item) => {
      const target = new Date(item.expiryDate);
      target.setHours(0, 0, 0, 0);

      const daysLeft = Math.ceil((target - today) / (1000 * 60 * 60 * 24));

      return {
        ...item,
        daysLeft,
      };
    });

    return recipes
      .map((recipe) => {
        const matchedItems = itemInfoList.filter((item) =>
          recipe.ingredients.some(
            (ingredient) =>
              item.name.includes(ingredient) || ingredient.includes(item.name)
          )
        );

        const matchedIngredients = matchedItems.map((item) => item.name);
        const matchScore = matchedIngredients.length / recipe.ingredients.length;

        let expiryBonus = 0;

        matchedItems.forEach((item) => {
          if (item.daysLeft <= 0) {
            expiryBonus += 3;
          } else if (item.daysLeft <= 2) {
            expiryBonus += 2;
          } else if (item.daysLeft <= 5) {
            expiryBonus += 1;
          }
        });

        const totalScore = matchScore * 100 + expiryBonus;

        return {
          ...recipe,
          matchedIngredients,
          matchScore,
          expiryBonus,
          totalScore,
        };
      })
      .filter((recipe) => recipe.matchedIngredients.length > 0)
      .sort((a, b) => b.totalScore - a.totalScore)
      .slice(0, 5);
  }, [items]);


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
          <h2>おすすめレシピ</h2>

          {suggestedRecipes.length === 0 ? (
            <p className="empty">
              登録された食材から提案できるレシピはまだありません。
            </p>
          ) : (
            <ul className="recipe-list">
              {suggestedRecipes.map((recipe) => (
                <li key={recipe.id} className="recipe-item">
                  <div className="recipe-title-row">
                    <h3>{recipe.name}</h3>

                    {recipe.expiryBonus >= 3 ? (
                      <span className="recipe-badge urgent">🔥 今作るべき</span>
                    ) : recipe.expiryBonus >= 1 ? (
                      <span className="recipe-badge soon">⏰ 早め推奨</span>
                    ) : null}
                  </div>
                  <p>{recipe.description}</p>
                  <p>必要食材: {recipe.ingredients.join("、")}</p>
                  <p>一致した食材: {recipe.matchedIngredients.join("、")}</p>
                  <p>一致率: {Math.round(recipe.matchScore * 100)}%</p>
                  <p>期限優先ボーナス: {recipe.expiryBonus}</p>
                  <p>総合スコア: {recipe.totalScore}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card">
          <h2>一覧</h2>

          {sortedItems.map((item) => {
            const days = getDaysLeft(item.expiryDate);

            return (
              <div key={item.id} className="item">
                <div className="item-left">
                  <h3>{item.name}</h3>
                  <p>{item.expiryDate}</p>
                  <p
                    className={
                      days < 0
                        ? "expired"
                        : days <= 2
                          ? "warning"
                          : "safe"
                    }
                  >
                    {days < 0
                      ? `${Math.abs(days)}日過ぎてます`
                      : days === 0
                        ? "今日まで"
                        : `あと${days}日`}
                  </p>
                </div>

                <button
                  className="delete-button"
                  onClick={() => handleDelete(item.id)}
                >
                  削除
                </button>
              </div>
            );
          })}
        </section>
      </div>
    </div>
  );
}

export default App;