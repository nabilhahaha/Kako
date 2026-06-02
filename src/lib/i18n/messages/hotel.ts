/** hotel module messages. Keep ar/en keys identical. */
export const ar = {
  hotel: {
    // ── No-company guard ──────────────────────────────────────────────────
    noCompany: 'إدارة الفندق تتم من داخل حساب الشركة. سجّل الدخول بحساب الفندق لإضافة الغرف والحجوزات.',
    noCompanyAction: 'هذه العملية تتم من داخل حساب الشركة. سجّل الدخول بحساب الفندق.',

    // ── Room status labels ────────────────────────────────────────────────
    roomStatus: {
      available: 'متاحة',
      occupied: 'مشغولة',
      cleaning: 'تنظيف',
      maintenance: 'صيانة',
    },

    // ── Booking status labels ─────────────────────────────────────────────
    bookingStatus: {
      reserved: 'محجوزة',
      checked_in: 'تسجيل دخول',
      checked_out: 'تسجيل خروج',
      cancelled: 'ملغاة',
    },

    // ── Rooms page ────────────────────────────────────────────────────────
    rooms: {
      title: 'الغرف',
      description: 'غرف ووحدات الفندق وحالتها.',
      newRoom: 'غرفة جديدة',
      addRoom: 'إضافة',
      cancel: 'إلغاء',
      empty: 'لا توجد غرف بعد. أضف أول غرفة.',
      toastAdded: 'تمت إضافة الغرفة',
      errorGeneric: 'حدث خطأ',
      // Form placeholders
      placeholderCode: 'رقم الغرفة *',
      placeholderName: 'الاسم (اختياري)',
      placeholderType: 'النوع (مفرد/جناح)',
      placeholderCapacity: 'السعة',
      placeholderRate: 'سعر الليلة',
      // Table headers
      colRoom: 'الغرفة',
      colType: 'النوع',
      colCapacity: 'السعة',
      colRate: 'سعر الليلة',
      colStatus: 'الحالة',
    },

    // ── Bookings page ─────────────────────────────────────────────────────
    bookings: {
      title: 'الحجوزات',
      description: 'حجوزات الغرف وتسجيل الدخول والخروج.',
      newBooking: 'حجز جديد',
      save: 'حفظ',
      cancel: 'إلغاء',
      empty: 'لا توجد حجوزات بعد.',
      noRoomsHint: 'أضف غرفة أولاً من صفحة الغرف.',
      errorGeneric: 'حدث خطأ',
      // Form
      selectRoom: 'اختر الغرفة *',
      perNight: 'ليلة/',
      placeholderGuestName: 'اسم النزيل *',
      placeholderGuestPhone: 'هاتف النزيل',
      labelCheckIn: 'تاريخ الدخول',
      labelCheckOut: 'تاريخ الخروج',
      // Table headers
      colGuest: 'النزيل',
      colRoom: 'الغرفة',
      colDates: 'الدخول → الخروج',
      colNights: 'الليالي',
      colTotal: 'الإجمالي',
      colPaid: 'المدفوع',
      colStatus: 'الحالة',
      colActions: 'إجراءات',
      // Row actions
      btnCheckIn: 'دخول',
      btnCheckOut: 'خروج',
      btnCollect: 'تحصيل',
      btnCancel: 'إلغاء',
      remaining: 'باقي {amount}',
      // Toast messages
      toastCreated: 'تم إنشاء الحجز',
      toastCheckedIn: 'تم تسجيل الدخول',
      toastCheckedOut: 'تم تسجيل الخروج',
      toastCancelled: 'تم الإلغاء',
      toastPaymentRecorded: 'تم تسجيل الدفعة',
      // Collect payment prompt
      collectTitle: 'تحصيل دفعة',
      collectMessage: '{name} — المتبقي {remaining} ج.م',
      collectLabel: 'مبلغ التحصيل',
      collectConfirm: 'تحصيل',
      errorInvalidAmount: 'مبلغ غير صحيح',
    },

    // ── Server action errors ──────────────────────────────────────────────
    errors: {
      roomCodeRequired: 'رقم/كود الغرفة مطلوب.',
      roomCodeDuplicate: 'كود الغرفة مستخدم بالفعل.',
      invalidStatus: 'حالة غير صحيحة.',
      roomRequired: 'اختر الغرفة.',
      guestNameRequired: 'اسم النزيل مطلوب.',
      datesRequired: 'تاريخا الدخول والخروج مطلوبان.',
      checkoutBeforeCheckin: 'تاريخ الخروج يجب أن يكون بعد تاريخ الدخول.',
      roomAlreadyBooked: 'الغرفة محجوزة في هذه الفترة.',
      invalidAmount: 'مبلغ غير صحيح.',
    },
  },
};

export const en = {
  hotel: {
    // ── No-company guard ──────────────────────────────────────────────────
    noCompany: 'Hotel management is handled inside the company account. Sign in with a hotel account to manage rooms and bookings.',
    noCompanyAction: 'This action must be performed inside the company account. Sign in with a hotel account.',

    // ── Room status labels ────────────────────────────────────────────────
    roomStatus: {
      available: 'Available',
      occupied: 'Occupied',
      cleaning: 'Cleaning',
      maintenance: 'Maintenance',
    },

    // ── Booking status labels ─────────────────────────────────────────────
    bookingStatus: {
      reserved: 'Reserved',
      checked_in: 'Checked In',
      checked_out: 'Checked Out',
      cancelled: 'Cancelled',
    },

    // ── Rooms page ────────────────────────────────────────────────────────
    rooms: {
      title: 'Rooms',
      description: 'Hotel rooms and units with their current status.',
      newRoom: 'New Room',
      addRoom: 'Add',
      cancel: 'Cancel',
      empty: 'No rooms yet. Add your first room.',
      toastAdded: 'Room added',
      errorGeneric: 'An error occurred',
      // Form placeholders
      placeholderCode: 'Room number *',
      placeholderName: 'Name (optional)',
      placeholderType: 'Type (single/suite)',
      placeholderCapacity: 'Capacity',
      placeholderRate: 'Nightly rate',
      // Table headers
      colRoom: 'Room',
      colType: 'Type',
      colCapacity: 'Capacity',
      colRate: 'Nightly Rate',
      colStatus: 'Status',
    },

    // ── Bookings page ─────────────────────────────────────────────────────
    bookings: {
      title: 'Bookings',
      description: 'Room bookings with check-in and check-out.',
      newBooking: 'New Booking',
      save: 'Save',
      cancel: 'Cancel',
      empty: 'No bookings yet.',
      noRoomsHint: 'Add a room first from the Rooms page.',
      errorGeneric: 'An error occurred',
      // Form
      selectRoom: 'Select room *',
      perNight: '/night',
      placeholderGuestName: 'Guest name *',
      placeholderGuestPhone: 'Guest phone',
      labelCheckIn: 'Check-in date',
      labelCheckOut: 'Check-out date',
      // Table headers
      colGuest: 'Guest',
      colRoom: 'Room',
      colDates: 'Check-in → Check-out',
      colNights: 'Nights',
      colTotal: 'Total',
      colPaid: 'Paid',
      colStatus: 'Status',
      colActions: 'Actions',
      // Row actions
      btnCheckIn: 'Check In',
      btnCheckOut: 'Check Out',
      btnCollect: 'Collect',
      btnCancel: 'Cancel',
      remaining: 'remaining {amount}',
      // Toast messages
      toastCreated: 'Booking created',
      toastCheckedIn: 'Checked in',
      toastCheckedOut: 'Checked out',
      toastCancelled: 'Cancelled',
      toastPaymentRecorded: 'Payment recorded',
      // Collect payment prompt
      collectTitle: 'Collect Payment',
      collectMessage: '{name} — Remaining {remaining} EGP',
      collectLabel: 'Amount',
      collectConfirm: 'Collect',
      errorInvalidAmount: 'Invalid amount',
    },

    // ── Server action errors ──────────────────────────────────────────────
    errors: {
      roomCodeRequired: 'Room number / code is required.',
      roomCodeDuplicate: 'This room code is already in use.',
      invalidStatus: 'Invalid status.',
      roomRequired: 'Please select a room.',
      guestNameRequired: 'Guest name is required.',
      datesRequired: 'Both check-in and check-out dates are required.',
      checkoutBeforeCheckin: 'Check-out date must be after check-in date.',
      roomAlreadyBooked: 'This room is already booked for that period.',
      invalidAmount: 'Invalid amount.',
    },
  },
};
