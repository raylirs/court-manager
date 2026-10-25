document.addEventListener('DOMContentLoaded', () => {
  let selectedCourtId = document.getElementById('selectedCourtId')?.value;
  let selectedDate = document.getElementById('selectedDateInput')?.value;
  let selectedCourtPrice = 0;
  let selectedCourtName = '';
  let selectedSlots = []; // Array of slot objects: { start, end, label }

  const quickDaysContainer = document.getElementById('quickDaysContainer');
  const datePicker = document.getElementById('datePicker');
  const slotsGrid = document.getElementById('slotsGrid');
  const slotsLoading = document.getElementById('slotsLoading');
  const selectedSlotsInput = document.getElementById('selectedSlotsInput');
  const summaryCourtName = document.getElementById('summaryCourtName');
  const summaryDate = document.getElementById('summaryDate');
  const summaryRate = document.getElementById('summaryRate');
  const summarySlotsCount = document.getElementById('summarySlotsCount');
  const summarySlotsList = document.getElementById('summarySlotsList');
  const summaryTotalPrice = document.getElementById('summaryTotalPrice');
  const btnContinueCheckout = document.getElementById('btnContinueCheckout');

  // Initialize court details from first active card
  const firstCourtCard = document.querySelector('.court-card');
  if (firstCourtCard) {
    selectedCourtPrice = parseFloat(firstCourtCard.dataset.courtPrice) || 0;
    selectedCourtName = firstCourtCard.dataset.courtName || '';
  }

  // Handle Quick Date Pills
  quickDaysContainer?.addEventListener('click', (e) => {
    const pill = e.target.closest('.quick-date-pill');
    if (!pill) return;

    document.querySelectorAll('.quick-date-pill').forEach(p => {
      p.classList.remove('border-brand-800', 'bg-brand-800', 'text-white', 'shadow-xs');
      p.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
    });

    pill.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
    pill.classList.add('border-brand-800', 'bg-brand-800', 'text-white', 'shadow-xs');

    selectedDate = pill.dataset.date;
    if (datePicker) datePicker.value = selectedDate;
    document.getElementById('selectedDateInput').value = selectedDate;

    // Reset slots
    selectedSlots = [];
    updateSummary();
    fetchAvailableSlots();
  });

  // Handle HTML5 Date Picker Change
  datePicker?.addEventListener('change', () => {
    selectedDate = datePicker.value;
    document.getElementById('selectedDateInput').value = selectedDate;

    // Highlight matching pill if exists, or remove all highlights
    document.querySelectorAll('.quick-date-pill').forEach(p => {
      if (p.dataset.date === selectedDate) {
        p.classList.remove('border-slate-200', 'bg-white', 'text-slate-700');
        p.classList.add('border-brand-800', 'bg-brand-800', 'text-white', 'shadow-xs');
      } else {
        p.classList.remove('border-brand-800', 'bg-brand-800', 'text-white', 'shadow-xs');
        p.classList.add('border-slate-200', 'bg-white', 'text-slate-700');
      }
    });

    selectedSlots = [];
    updateSummary();
    fetchAvailableSlots();
  });

  // Handle Court Card Click
  document.querySelectorAll('.court-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.court-card').forEach(c => {
        c.classList.remove('border-brand-800', 'bg-brand-50/40', 'ring-2', 'ring-brand-800/15');
        c.classList.add('border-slate-200', 'bg-white');
        const ind = c.querySelector('.court-check-indicator');
        if (ind) ind.classList.add('hidden');
      });

      card.classList.remove('border-slate-200', 'bg-white');
      card.classList.add('border-brand-800', 'bg-brand-50/40', 'ring-2', 'ring-brand-800/15');
      const ind = card.querySelector('.court-check-indicator');
      if (ind) ind.classList.remove('hidden');

      selectedCourtId = card.dataset.courtId;
      selectedCourtPrice = parseFloat(card.dataset.courtPrice) || 0;
      selectedCourtName = card.dataset.courtName;

      document.getElementById('selectedCourtId').value = selectedCourtId;

      selectedSlots = [];
      updateSummary();
      fetchAvailableSlots();
    });
  });

  // Fetch Available Slots via API
  async function fetchAvailableSlots() {
    if (!selectedCourtId || !selectedDate) return;

    if (slotsLoading) slotsLoading.classList.remove('hidden');
    if (slotsGrid) slotsGrid.innerHTML = '';

    try {
      const res = await fetch(`/api/available-slots?court_id=${selectedCourtId}&date=${selectedDate}`);
      const data = await res.json();

      if (slotsLoading) slotsLoading.classList.add('hidden');

      if (!data.success || !data.slots || data.slots.length === 0) {
        slotsGrid.innerHTML = `
          <div class="col-span-full py-8 text-center text-slate-400 bg-slate-50 rounded-xl border border-dashed border-slate-200">
            <p class="text-xs font-semibold">No time slots available for this date.</p>
          </div>
        `;
        return;
      }

      data.slots.forEach(slot => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `time-slot-btn ${slot.isAvailable ? '' : 'disabled'}`;
        btn.disabled = !slot.isAvailable;
        btn.dataset.start = slot.start;
        btn.dataset.end = slot.end;
        btn.dataset.label = slot.label;

        btn.innerHTML = `
          <span class="text-xs font-bold">${slot.label}</span>
          <span class="text-[10px] ${slot.isAvailable ? 'text-brand-700 font-semibold' : 'text-slate-400'}">${slot.isAvailable ? 'Available' : (slot.reason || 'Booked')}</span>
        `;

        if (slot.isAvailable) {
          btn.addEventListener('click', () => toggleSlot(btn, slot));
        }

        slotsGrid.appendChild(btn);
      });
    } catch (err) {
      if (slotsLoading) slotsLoading.classList.add('hidden');
      slotsGrid.innerHTML = `
        <div class="col-span-full py-6 text-center text-rose-500 text-xs">
          Failed to load available slots. Please refresh or try again.
        </div>
      `;
    }
  }

  // Toggle Slot Selection
  function toggleSlot(buttonElement, slot) {
    const existingIndex = selectedSlots.findIndex(s => s.start === slot.start);

    if (existingIndex >= 0) {
      selectedSlots.splice(existingIndex, 1);
      buttonElement.classList.remove('selected');
    } else {
      selectedSlots.push(slot);
      buttonElement.classList.add('selected');
    }

    // Sort selected slots chronologically
    selectedSlots.sort((a, b) => a.start.localeCompare(b.start));

    updateSummary();
  }

  // Update Summary Card & Checkout State
  function updateSummary() {
    if (summaryCourtName) summaryCourtName.textContent = selectedCourtName || 'None';
    if (summaryRate) summaryRate.textContent = `₱${selectedCourtPrice.toLocaleString('en-PH', { minimumFractionDigits: 2 })}/hr`;
    
    // Format date display
    if (selectedDate && summaryDate) {
      const d = new Date(selectedDate + 'T00:00:00');
      summaryDate.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    }

    const count = selectedSlots.length;
    if (summarySlotsCount) summarySlotsCount.textContent = `${count} slot(s) selected`;

    if (count === 0) {
      if (summarySlotsList) summarySlotsList.textContent = 'No time slots chosen yet';
      if (summaryTotalPrice) summaryTotalPrice.textContent = '₱0.00';
      if (btnContinueCheckout) btnContinueCheckout.disabled = true;
      if (selectedSlotsInput) selectedSlotsInput.value = '';
    } else {
      const totalAmount = count * selectedCourtPrice;
      if (summaryTotalPrice) summaryTotalPrice.textContent = `₱${totalAmount.toLocaleString('en-PH', { minimumFractionDigits: 2 })}`;

      const slotLabels = selectedSlots.map(s => s.label).join(', ');
      if (summarySlotsList) summarySlotsList.innerHTML = `<span class="text-slate-800 font-semibold">${slotLabels}</span>`;
      
      if (btnContinueCheckout) btnContinueCheckout.disabled = false;
      if (selectedSlotsInput) selectedSlotsInput.value = JSON.stringify(selectedSlots);
    }
  }

  // Initial slot fetch on page load
  fetchAvailableSlots();
});
