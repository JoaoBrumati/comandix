document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.faq-question').forEach((button) => {
    button.addEventListener('click', () => {
      const item = button.closest('.faq-item');
      const isOpen = item.classList.contains('open');

      document.querySelectorAll('.faq-item').forEach((faq) => {
        faq.classList.remove('open');
      });

      if (!isOpen) {
        item.classList.add('open');
      }
    });
  });
});
