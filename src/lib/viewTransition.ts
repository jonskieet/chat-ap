// Bọc 1 thao tác điều hướng/cập nhật DOM bằng View Transitions API của trình duyệt
// (document.startViewTransition) để tạo hiệu ứng "morph" mượt giữa 2 trạng thái —
// dùng cho shared element transition Home -> PostDetail (ảnh bay từ card sang trang chi tiết).
// Trình duyệt chưa hỗ trợ (vd Firefox, Safari cũ) sẽ fallback chạy callback bình thường,
// không lỗi, không animation — degrade gracefully.
export function withViewTransition(callback: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => void
  }
  if (typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(callback)
  } else {
    callback()
  }
}
