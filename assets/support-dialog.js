(() => {
  const trigger = document.getElementById('support-author');
  const dialog = document.getElementById('support-dialog');
  const close = document.getElementById('support-close');
  if (!trigger || !dialog || !close) return;
  trigger.addEventListener('click', () => dialog.showModal());
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const box = dialog.getBoundingClientRect();
    if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
  });
  dialog.addEventListener('close', () => trigger.focus());
})();
