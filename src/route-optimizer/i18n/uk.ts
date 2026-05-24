const uk = {
  translation: {
    // ─── Додаток / Заголовок ────────────────────────────────────────
    app: {
      title: 'JPFOOD Оптимізатор маршрутів',
      subtitle: 'Проєктування територій та планування маршрутів FMCG',
    },
    language: {
      en: 'English',
      uk: 'Українська',
      ar: 'العربية',
      switchLabel: 'Мова',
    },

    // ─── Імпорт даних ──────────────────────────────────────────────
    import: {
      title: 'Імпорт даних',
      description:
        'Завантажте файл із базою клієнтів для початку планування маршрутів. Файл повинен містити коди клієнтів, назви, координати та частоту відвідувань.',
      dropzoneText: 'Перетягніть файл Excel сюди або натисніть для вибору',
      supportedFormats: 'Підтримувані формати: .xlsx, .xls, .csv',
      fileLoaded: 'Файл успішно завантажено',
      customersFound: 'Знайдено клієнтів: {{count}}',
      citiesFound: 'Знайдено міст: {{count}}',
      branchesFound: 'Знайдено філій: {{count}}',
      errors: {
        invalidFile: 'Недійсний формат файлу. Завантажте файл Excel або CSV.',
        noCoordinates:
          'Координати не знайдено. Переконайтеся, що в файлі є стовпці широти та довготи.',
        parseError: 'Не вдалося обробити файл. Перевірте формат і спробуйте ще раз.',
      },
    },

    // ─── Область планування ─────────────────────────────────────────
    scope: {
      title: 'Область планування',
      selectCity: 'Обрати місто',
      selectBranch: 'Обрати філію',
      allCities: 'Усі міста',
      allBranches: 'Усі філії',
      excludeInactive: 'Виключити неактивних клієнтів',
      customersInScope: 'Клієнтів в області: {{count}}',
    },

    // ─── Параметри оптимізації ──────────────────────────────────────
    params: {
      title: 'Параметри оптимізації',
      distributionMethod: 'Метод розподілу',
      countMode: 'За кількістю клієнтів',
      workloadMode: 'За балансом навантаження',
      numberOfRoutes: 'Кількість маршрутів',
      customersPerRoute: 'Клієнтів на маршрут',
      workingDaysPerWeek: 'Робочих днів на тиждень',
      workingDays: {
        six: '6 (Сб–Чт)',
        five: '5',
        four: '4',
      },
      avgVisitTime: 'Середній час візиту',
      avgVisitTimeUnit: 'хвилин',
      workingHoursPerDay: 'Робочих годин на день',
      avgSpeed: 'Середня швидкість руху',
      speedUnit: 'км/год',
      weeklyFrequencySource: 'Джерело тижневої частоти',
      automatic: 'Автоматично (з даних)',
      uniform: 'Рівномірна',
      frequencyPerWeek: 'Частота на тиждень',
      outlierIsolationDist: 'Відстань ізоляції викидів',
      distanceUnit: 'км',
      createOutstationRoutes: 'Створити виїзні маршрути',
      outlierLinkDist: "Відстань зв'язку викидів",
      dailyKmCap: 'Денний ліміт км',
      disabledHint: '0 = вимкнено',
      runOptimization: 'Запустити оптимізацію',
      optimizing: 'Оптимізація…',
      cancel: 'Скасувати',
    },

    // ─── Прогрес ────────────────────────────────────────────────────
    progress: {
      title: 'Хід оптимізації',
      stepDistributing: 'Розподіл клієнтів по маршрутах…',
      stepSequencing: 'Визначення послідовності щоденних візитів…',
      stepAllocating: 'Розподіл тижневих графіків…',
      stepCalculating: 'Розрахунок відстаней та показників…',
      completed: 'Оптимізацію завершено',
    },

    // ─── Результати – Карта ─────────────────────────────────────────
    map: {
      title: 'Карта маршрутів',
      showRoute: 'Показати маршрут',
      hideRoute: 'Приховати маршрут',
      showAll: 'Показати все',
      hideAll: 'Приховати все',
      routeLabel: 'Маршрут {{number}}',
      customers: 'Клієнти',
      depot: 'Депо',
      outlier: 'Викид',
      outstation: 'Виїзна точка',
      normalRoute: 'Звичайний маршрут',
      outstationRoute: 'Виїзний маршрут',
    },

    // ─── Результати – Картки маршрутів ──────────────────────────────
    routeCards: {
      title: 'Зведення маршрутів',
      routeNumber: 'Маршрут {{number}}',
      routeType: 'Тип маршруту',
      weeklyKm: 'Тижневий км',
      monthlyKm: 'Місячний км',
      sellingTimeRatio: 'Частка часу продажів',
      avgDailyHours: 'Середній час на день',
      dayDetail: {
        dayNumber: 'День {{number}}',
        dayCustomers: '{{count}} клієнтів',
        dayKm: '{{km}} км',
        dayHours: '{{hours}} год',
      },
      googleMapsLink: 'Відкрити в Google Maps',
      warnings: {
        hoursExceeded: 'Перевищено денний ліміт годин',
        kmExceeded: 'Перевищено денний ліміт км',
        lowSellingTime: 'Частка часу продажів нижча за ціль',
      },
      normal: 'Звичайний',
      outstationLabel: 'Виїзний',
    },

    // ─── Результати – Таблиця візитів ───────────────────────────────
    visitTable: {
      title: 'Графік візитів',
      filterByRoute: 'Фільтр за маршрутом',
      filterByDay: 'Фільтр за днем',
      allRoutes: 'Усі маршрути',
      allDays: 'Усі дні',
      columns: {
        route: 'Маршрут',
        day: 'День',
        sequence: '№',
        customerCode: 'Код клієнта',
        customerName: 'Назва клієнта',
        city: 'Місто',
        frequency: 'Частота',
        latitude: 'Широта',
        longitude: 'Довгота',
      },
      noResults: 'Немає результатів за обраними фільтрами.',
    },

    // ─── Результати – KPI ───────────────────────────────────────────
    kpi: {
      title: 'Ключові показники ефективності',
      totalRoutes: 'Загальна кількість маршрутів',
      distributedCustomers: 'Розподілені клієнти',
      monthlyVisits: 'Візити за місяць',
      monthlyDistance: 'Відстань за місяць',
      loadBalance: 'Баланс навантаження',
      avgSellingTime: 'Середній час продажів',
      unassignedCustomers: 'Нерозподілені клієнти',
      overloadedRoutes: 'Перевантажені маршрути',
      commercialRating: 'Комерційна оцінка',
      outstationSection: 'Виїзні маршрути',
      needsDecisionSection: 'Потребує рішення',
      commentary: {
        excellent: 'Відмінно — усі маршрути відповідають цільовим параметрам.',
        good: 'Добре — незначні корекції можуть покращити баланс.',
        acceptable: 'Прийнятно — перегляньте перевантажені маршрути для перебалансування.',
        poor: 'Незадовільно — рекомендується суттєве перебалансування.',
      },
    },

    // ─── Початкові точки / Депо ─────────────────────────────────────
    depot: {
      title: 'Початкові точки',
      enterCoordinates: 'Ввести координати',
      clickOnMap: 'Натиснути на карті',
      selectCustomer: 'Обрати клієнта',
      latitude: 'Широта',
      longitude: 'Довгота',
      setDepot: 'Встановити депо',
      depotSet: 'Депо встановлено',
      resetDepot: 'Скинути депо',
    },

    // ─── Друк маршрутного плану ─────────────────────────────────────
    print: {
      journeyPlan: 'Друк маршрутного плану',
      masterPlan: 'Друк генерального плану',
      printAll: 'Друкувати все',
      printSelected: 'Друкувати обране',
      journeyPlanTitle: 'Маршрутний план торгового представника',
      masterPlanTitle: 'Генеральний план маршрутів',
      companyName: 'Назва компанії',
      salesmanName: "Ім'я торгового представника",
      salesmanNumber: 'Номер торгового представника',
      branch: 'Філія',
      region: 'Регіон',
      issueDate: 'Дата видачі',
      planPeriod: 'Період плану',
      totalCustomers: 'Загальна кількість клієнтів',
      workingDays: 'Робочі дні',
      weeklyVisits: 'Візити за тиждень',
      startPoint: 'Початкова точка',
      tableHeaders: {
        seq: '№',
        customerCode: 'Код клієнта',
        customerName: 'Назва клієнта',
        cityDistrict: 'Місто / Район',
        frequency: 'Частота',
        done: 'Виконано',
        notes: 'Примітки',
      },
      dayFooter: {
        customersToday: 'Клієнтів сьогодні: {{count}}',
        expectedKm: 'Очікувана відстань: {{km}} км',
      },
      signatureArea: {
        salesmanSignature: 'Підпис торгового представника',
        supervisorSignature: 'Підпис супервайзера',
      },
      days: {
        saturday: 'Субота',
        sunday: 'Неділя',
        monday: 'Понеділок',
        tuesday: 'Вівторок',
        wednesday: 'Середа',
        thursday: 'Четвер',
      },
    },

    // ─── Загальне ───────────────────────────────────────────────────
    common: {
      save: 'Зберегти',
      cancel: 'Скасувати',
      close: 'Закрити',
      export: 'Експорт',
      print: 'Друк',
      download: 'Завантажити',
      loading: 'Завантаження…',
      error: 'Помилка',
      warning: 'Попередження',
      info: 'Інформація',
      success: 'Успішно',
      yes: 'Так',
      no: 'Ні',
      enabled: 'Увімкнено',
      disabled: 'Вимкнено',
      km: 'км',
      hours: 'годин',
      minutes: 'хвилин',
      perWeek: 'на тиждень',
      perMonth: 'на місяць',
      noData: 'Дані відсутні',
      selectOption: 'Оберіть варіант',
    },

    // ─── Експорт Excel ──────────────────────────────────────────────
    excel: {
      exportExcel: 'Експорт у Excel',
      sheetWeeklyPlan: 'Тижневий план',
      sheetRouteSummary: 'Зведення маршрутів',
      sheetNeedsDecision: 'Потребує рішення',
      sheetUnassigned: 'Нерозподілені',
    },
  },
} as const;

export default uk;
