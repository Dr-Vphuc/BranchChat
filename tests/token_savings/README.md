# Đo mức tiết kiệm token: rẽ nhánh vs tuyến tính

Harness Python độc lập (không đụng code app) để định lượng: so với một chat **tuyến tính**
(gửi toàn bộ lịch sử mỗi lượt), mô hình **rẽ nhánh** của BranchChat tiết kiệm **bao nhiêu %
input-token trung bình mỗi phiên**.

> Khoản tiết kiệm là **tính chất số học của hình dạng cây + kích thước (token) mỗi lượt** —
> *không* phụ thuộc nội dung câu hỏi và *không* cần gọi LLM.

## Cách chạy

```bash
# Tự kiểm tra công thức (assert khớp ví dụ tính tay) — không cần dữ liệu/mạng:
python tests/token_savings/run.py --selftest

# Báo cáo trên fixture tổng hợp (mặc định):
python tests/token_savings/run.py

# (tuỳ chọn) số token chính xác hơn — cài tiktoken:
pip install -r tests/token_savings/requirements.txt

# Replay phiên chat THẬT từ DB dev:
python tests/token_savings/run.py --db src/backend/branchchat.db
```

Cờ khác: `--tokenizer {tiktoken,heuristic}` (ép bộ đếm), `--json` (in thêm JSON),
`--csv out.csv` (xuất bảng per-session).

## Phép đo

Mỗi node sinh ra = 1 lời gọi API. Với node `n`:
`prompt_tokens(n)` = token của message **không phải assistant** (user + system);
`answer_tokens(n)` = token của message **assistant**.

- **Rẽ nhánh** (đi ngược `parentId` về gốc — như `assembleContext`/`getChainToRoot` trong
  [utils.ts](../../src/frontend/src/app/lib/utils.ts)):
  `branch_input(n) = Σ_{tổ tiên a}(prompt+answer)(a) + prompt(n)`
- **Tuyến tính** (full-history, thứ tự tạo theo `createdAt`):
  `linear_input(n) = Σ_{node tạo trước n}(prompt+answer) + prompt(n)`
- **Tiết kiệm 1 phiên** = `(Σ linear_input − Σ branch_input) / Σ linear_input`.

Output token giống nhau ở cả hai mô hình nên bị loại khỏi phép đo.

> **Giả định baseline:** ở chế độ tuyến tính, người dùng vẫn hỏi đúng các câu (kể cả lạc đề)
> trong **một** thread. Đây là so sánh "táo với táo" cho luận điểm "rẽ nhánh giúp các nhánh
> lạc đề không cộng dồn vào nhau". Cây thẳng (không rẽ nhánh) ⇒ tiết kiệm 0%.

## Đọc kết quả

- **mean saved%** — trung bình cộng % của các phiên (đáp đúng "trung bình mỗi phiên", headline).
- **pooled saved%** — `Σ saved / Σ linear` toàn corpus (các phiên lớn chi phối nhiều hơn).

Con số phụ thuộc **hoàn toàn vào hình dạng cây**: rẽ nhánh càng sớm, các nhánh anh em càng to
thì càng tiết kiệm. Fixture chỉ là **giả định mô hình hoá** (xem `Q_TOKENS`/`A_TOKENS` và các
archetype trong [fixtures.py](fixtures.py)) — muốn số trung thực với thói quen của bạn thì dùng
`--db` trên dữ liệu thật.

## Lấy DB thật từ Docker

DB trong Docker nằm trên named volume, không nằm trực tiếp trên host. Copy ra rồi trỏ `--db`:

```bash
docker compose cp app:/app/data/branchchat.db ./bc.db
python tests/token_savings/run.py --db ./bc.db
```

## Tệp

| Tệp             | Vai trò                                                        |
| --------------- | -------------------------------------------------------------- |
| `measure.py`    | `Node` + công thức `branch_input` / `linear_input` / tổng hợp. |
| `tokenizer.py`  | `count_tokens()` — tiktoken nếu có, fallback heuristic ceil(len/4). |
| `fixtures.py`   | `gen_tree()` + các archetype cây tổng hợp.                     |
| `loader.py`     | Đọc SQLite `conversations` → `list[Node]` (tokenize message).  |
| `run.py`        | CLI: fixture / `--db` / `--selftest` / `--json` / `--csv`.     |

## Phạm vi

- Chưa quy ra tiền (token tuyệt đối × bảng giá Gemini — tính sau).
- Không gọi LLM, không tính output-token.
- Baseline chỉ là "tuyến tính full-history" (không mô phỏng cửa sổ trượt K lượt).
- Chỉ đo cây cuối cùng, mỗi node 1 lần sinh (không tính chi phí re-run khi Sửa).
