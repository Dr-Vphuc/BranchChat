# Benchmark chất lượng: context sạch (rẽ nhánh) vs bị nhiễu (tuyến tính)

Harness Python độc lập (không đụng code app) để trả lời: **rẽ nhánh có làm giảm
chất lượng trả lời không?** Hơn nữa nó kiểm chứng thế mạnh cốt lõi — *tách câu lạc đề
sang luồng khác để context không bị "bẩn"*.

> Ý tưởng: chat **tuyến tính** càng dài, càng nhiều câu lạc đề thì model càng bị nhiễu.
> Rẽ nhánh chỉ gửi **chuỗi gốc→node** (`assembleContext`) nên context luôn sạch. Đây là
> hiện tượng đã được nghiên cứu (GSM-IC, Shi et al. 2023 — *LLMs dễ bị phân tâm bởi
> irrelevant context*).

## Thiết kế: quét nhiễu có kiểm soát

Lấy **cùng một bài toán GSM8K** (có đáp án số chuẩn). Chèn `k` lượt Q+A **lạc đề** vào
**trước** nó rồi đo độ chính xác:

- **`k = 0`** = **rẽ nhánh** (context sạch — đúng cái app gửi).
- **`k > 0`** = **tuyến tính** (cái một chat-một-luồng gửi khi user hỏi lạc đề giữa chừng).

Vì context rẽ nhánh không bao giờ chứa distractor, accuracy ở `k=0` chính là baseline sạch;
ta chỉ cần xem accuracy **tụt** bao nhiêu khi `k` tăng.

- **Lợi thế rẽ nhánh(k)** = `accuracy(0) − accuracy(k)` (kỳ vọng dương, tăng theo `k`).
- **Token thừa(k)** = `mean_prompt_tokens(k) − mean_prompt_tokens(0)` (đếm token **thật** từ
  `usage_metadata`) — nối thẳng vào kết quả tiết kiệm token ở `tests/token_savings/`.

## Cách chạy

```bash
# 0) (một lần) tải mẫu GSM8K về data/gsm8k_sample.jsonl — chỉ cần stdlib:
python tests/quality_bench/fetch_data.py

# 1) Offline — kiểm tra grader + bộ dựng hội thoại, KHÔNG gọi API:
python tests/quality_bench/run.py --selftest

# 2) Cài thư viện gọi model (giống backend) rồi smoke ~20 call:
pip install -r tests/quality_bench/requirements.txt
python tests/quality_bench/run.py --n 10 --k 0,4

# 3) Full mặc định: N=200, k=0,2,4,8,16 (~1000 call):
python tests/quality_bench/run.py
```

API key lấy từ `src/backend/.env` (`GEMINI_API_KEY`) — đúng file dùng khi chạy app.

Cờ: `--n` (số bài), `--k 0,2,4,8,16`, `--distractor {near,off,mix}`, `--model`,
`--json`, `--csv out.csv`, `--no-cache`, `--selftest`.

## Loại distractor (`--distractor`)

- `near` — **bài GSM8K khác** (cùng miền, số liệu dễ bị model trộn nhầm → nhiễu *khó* nhất).
- `off` — câu lạc đề/chit-chat (từ `data/offtopic.json`).
- `mix` — xen kẽ near/off (mặc định).

Distractor là **cặp Q+A đầy đủ** (cả câu trả lời dài), vì trong chat thật câu trả lời lạc đề
cũng nằm trong lịch sử và làm bẩn context lẫn tốn token. Lựa chọn distractor **tất định** theo
chỉ số bài và **lồng nhau** (k nhỏ là tiền tố của k lớn) nên đường cong theo `k` mượt.

## Đọc kết quả

Bảng có cột `accuracy%`, `lợi thế(pp)` (so với `k=0`), `mean_tok`, `token thừa`. Kỳ vọng:
`accuracy(0) ≥ accuracy(k)` và khoảng cách **doãng ra** khi `k` tăng — rõ nhất với `--distractor near`.

## Lưu ý

- ⚠️ **Quota/thời gian:** `gemini-2.5-flash-lite` giới hạn RPM. Chạy `--n` nhỏ trước; full ~1000 call.
  Có **retry/backoff** khi rate-limit và **cache** kết quả ở `data/.cache/` (đã gitignore) nên chạy
  lại gần như miễn phí. Dùng `--no-cache` để buộc gọi lại.
- `temperature=0` để giảm nhiễu/đỡ tái lập; flash-lite vẫn có thể lệch nhẹ giữa các lần.

## Tệp

| Tệp | Vai trò |
| --- | --- |
| `dataset.py` | Đọc GSM8K từ `data/gsm8k_sample.jsonl`, tách đáp án gold. |
| `distractors.py` | Dựng lượt nhiễu near/off/mix (tất định, lồng nhau). |
| `conversation.py` | Ráp mảng message: clean (rẽ nhánh) vs polluted (tuyến tính). |
| `client.py` | Gọi Gemini (temp 0, retry), trả `(text, prompt_token_count)`. |
| `grader.py` | Trích số cuối + so với gold. |
| `run.py` | Quét `k`, cache, in bảng accuracy vs token; `--selftest`. |
| `fetch_data.py` | Tải mẫu GSM8K (stdlib). |

## Phạm vi

- Chưa quy ra tiền; không dùng LLM-judge; không đo chất lượng chat mở.
- Chỉ Design A (câu đích tự đủ, distractor chèn trước). Design B (chôn *fact cần thiết*
  giữa distractor) để sau.
- Gọi thẳng Gemini (không qua proxy app) để kiểm soát chính xác context.
