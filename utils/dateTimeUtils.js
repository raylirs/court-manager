function formatCurrency(amount) {
  const num = parseFloat(amount) || 0;
  return '₱' + num.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTime12(time24) {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr || '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12; // '0' becomes '12'
  return `${h}:${m} ${ampm}`;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });
}

function generateReference() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let rand = '';
  for (let i = 0; i < 5; i++) {
    rand += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `CM-${rand}`;
}

// Generates time slots given open time (e.g. "06:00"), close time (e.g. "22:00"), and step in mins (e.g. 60)
function generateSlots(openTime = '06:00', closeTime = '22:00', stepMinutes = 60) {
  const slots = [];
  const [startH, startM] = openTime.split(':').map(Number);
  const [endH, endM] = closeTime.split(':').map(Number);

  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + stepMinutes <= endMinutes) {
    const slotStartH = Math.floor(currentMinutes / 60);
    const slotStartM = currentMinutes % 60;
    const nextMinutes = currentMinutes + stepMinutes;
    const slotEndH = Math.floor(nextMinutes / 60);
    const slotEndM = nextMinutes % 60;

    const start24 = `${String(slotStartH).padStart(2, '0')}:${String(slotStartM).padStart(2, '0')}`;
    const end24 = `${String(slotEndH).padStart(2, '0')}:${String(slotEndM).padStart(2, '0')}`;

    slots.push({
      start: start24,
      end: end24,
      label: `${formatTime12(start24)} - ${formatTime12(end24)}`
    });

    currentMinutes += stepMinutes;
  }

  return slots;
}

module.exports = {
  formatCurrency,
  formatTime12,
  formatDateDisplay,
  generateReference,
  generateSlots
};
