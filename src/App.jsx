import { useEffect, useMemo, useRef, useState } from "react";
import { createWorker } from "tesseract.js";
import "./App.css";
import recipes from "./recipes";
import foodShelfLife from "./foodShelfLife";
import foodDictionary from "./foodDictionary";

function App() {
  const [name, setName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [memo, setMemo] = useState("");
  const [editingId, setEditingId] = useState(null);

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
      try {
        setOcrStatus("OCRエンジン準備中...");
        workerRef.current = await createWorker("jpn+eng", 1, {
          logger: (m) => {
            if (m.status === "recognizing text") {
              setOcrStatus(`読み取り中... ${Math.round(m.progress * 100)}%`);
            }
          },
        });
        setOcrStatus("OCR準備完了");
      } catch (error) {
        console.error(error);
        setOcrStatus("OCR初期化失敗");
      }
    };

    initWorker();

    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const preprocessImage = (file) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (event) => {
        img.src = event.target.result;
      };

      reader.onerror = () => reject(new Error("画像の読み込みに失敗しました"));

      img.onload = () => {
        const scale = 2;
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        if (!ctx) {
          reject(new Error("Canvasの初期化に失敗しました"));
          return;
        }

        canvas.width = img.width * scale;
        canvas.height = img.height * scale;

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;

        for (let i = 0; i < data.length; i += 4) {
          const r = data[i];
          const g = data[i + 1];
          const b = data[i + 2];

          const gray = 0.299 * r + 0.587 * g + 0.114 * b;
          const boosted = gray > 160 ? 255 : gray < 110 ? 0 : gray;

          data[i] = boosted;
          data[i + 1] = boosted;
          data[i + 2] = boosted;
        }

        ctx.putImageData(imageData, 0, 0);
        resolve(canvas.toDataURL("image/png"));
      };

      img.onerror = () => reject(new Error("画像の変換に失敗しました"));

      reader.readAsDataURL(file);
    });
  };

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
    setOcrStatus("画像を前処理しています...");

    try {
      const processedImage = await preprocessImage(imageFile);

      setOcrStatus("OCR実行中...");

      const result = await workerRef.current.recognize(processedImage);
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

  const normalizeText = (text) =>
    text
      .replace(/\s+/g, "")
      .replace(/[ァ-ン]/g, (s) =>
        String.fromCharCode(s.charCodeAt(0) - 0x60)
      );

  const normalizedOcrText = normalizeText(ocrText);

  const matchedFoods = foodDictionary.filter((food) => {
    const normalizedFood = normalizeText(food);
    return normalizedOcrText.includes(normalizedFood);
  });

  return [...new Set(matchedFoods)].slice(0, 8);
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

const normalizeName = (text) =>
  text
    .trim()
    .replace(/\s+/g, "")
    .replace(/[ァ-ン]/g, (s) =>
      String.fromCharCode(s.charCodeAt(0) - 0x60)
    );

const handleSelectCandidate = (candidate) => {
  const safeCandidate = String(candidate || "").trim();
  if (!safeCandidate) return;

  const normalizedCandidate = normalizeName(safeCandidate);

  const matchedKey = Object.keys(foodShelfLife || {}).find((key) => {
    const normalizedKey = normalizeName(key);
    return (
      normalizedCandidate === normalizedKey ||
      normalizedCandidate.includes(normalizedKey) ||
      normalizedKey.includes(normalizedCandidate)
    );
  });

  const selectedName = matchedKey || safeCandidate;
  setName(selectedName);

  if (matchedKey && foodShelfLife[matchedKey]?.days != null) {
    const { days } = foodShelfLife[matchedKey];

    const today = new Date();
    const target = new Date(today);
    target.setDate(today.getDate() + days);

    const yyyy = target.getFullYear();
    const mm = String(target.getMonth() + 1).padStart(2, "0");
    const dd = String(target.getDate()).padStart(2, "0");

    setExpiryDate(`${yyyy}-${mm}-${dd}`);
  } else {
    setExpiryDate("");
  }

  setEditingId(null);
};

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!name || !expiryDate) {
      alert("入力してください");
      return;
    }

    if (editingId) {
      setItems((prev) =>
        prev.map((item) =>
          item.id === editingId
            ? {
              ...item,
              name,
              expiryDate,
              memo,
            }
            : item
        )
      );
      setEditingId(null);
    } else {
      const newItem = {
        id: crypto.randomUUID(),
        name,
        expiryDate,
        memo,
      };

      setItems((prev) => [...prev, newItem]);
    }

    setName("");
    setExpiryDate("");
    setMemo("");
  };

  const handleDelete = (id) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  const handleEdit = (item) => {
    setName(item.name);
    setExpiryDate(item.expiryDate);
    setMemo(item.memo || "");
    setEditingId(item.id);
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

          <button type="button" onClick={handleRunOcr}>
            {isOcrLoading ? "解析中..." : "OCR実行"}
          </button>

          <p>{ocrStatus}</p>

          {imagePreview && (
            <div>
              <img
                src={imagePreview}
                alt="preview"
                style={{ maxWidth: "100%", marginTop: "8px" }}
              />
            </div>
          )}

          {ocrText && (
            <textarea
              value={ocrText}
              onChange={(e) => setOcrText(e.target.value)}
            />
          )}

          {candidateFoods.length > 0 ? (
            <div>
              <h3>候補</h3>
              {candidateFoods.map((c, index) => (
                <button
                  key={`${c}-${index}`}
                  type="button"
                  onClick={() => handleSelectCandidate(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : (
            <p className="empty">
              候補を見つけられませんでした。手入力してください。
            </p>
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

            <button type="submit" className="submit-button">
              {editingId ? "更新" : "追加"}
            </button>
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

          {sortedItems.length === 0 ? (
            <p className="empty">まだ食材が登録されていません。</p>
          ) : (
            sortedItems.map((item) => {
              const days = getDaysLeft(item.expiryDate);

              return (
                <div key={item.id} className="item">
                  <div className="item-left">
                    <h3>{item.name}</h3>
                    <p>{item.expiryDate}</p>
                    <p
                      className={
                        days < 0 ? "expired" : days <= 2 ? "warning" : "safe"
                      }
                    >
                      {days < 0
                        ? `${Math.abs(days)}日過ぎてます`
                        : days === 0
                          ? "今日まで"
                          : `あと${days}日`}
                    </p>
                    {item.memo && <p>{item.memo}</p>}
                  </div>

                  <div className="item-actions">
                    <button
                      type="button"
                      className="edit-button"
                      onClick={() => handleEdit(item)}
                    >
                      編集
                    </button>

                    <button
                      type="button"
                      className="delete-button"
                      onClick={() => handleDelete(item.id)}
                    >
                      削除
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

export default App;