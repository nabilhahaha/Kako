const en = {
  translation: {
    // ─── App / Header ───────────────────────────────────────────────
    app: {
      title: 'JPFOOD Route Optimizer',
      subtitle: 'FMCG Territory Design & Route Planning',
    },
    language: {
      en: 'English',
      uk: 'Українська',
      ar: 'العربية',
      switchLabel: 'Language',
    },

    // ─── Data Import ────────────────────────────────────────────────
    import: {
      title: 'Data Import',
      description:
        'Upload your customer master file to begin route planning. The file should contain customer codes, names, coordinates, and visit frequencies.',
      dropzoneText: 'Drag & drop your Excel file here, or click to browse',
      supportedFormats: 'Supported formats: .xlsx, .xls, .csv',
      fileLoaded: 'File loaded successfully',
      customersFound: '{{count}} customers found',
      citiesFound: '{{count}} cities found',
      branchesFound: '{{count}} branches found',
      errors: {
        invalidFile: 'Invalid file format. Please upload an Excel or CSV file.',
        noCoordinates:
          'No coordinate data found. Ensure latitude and longitude columns are present.',
        parseError: 'Failed to parse file. Please check the format and try again.',
      },
    },

    // ─── Planning Scope ─────────────────────────────────────────────
    scope: {
      title: 'Planning Scope',
      selectCity: 'Select City',
      selectBranch: 'Select Branch',
      allCities: 'All Cities',
      allBranches: 'All Branches',
      excludeInactive: 'Exclude inactive customers',
      customersInScope: '{{count}} customers in scope',
    },

    // ─── Optimization Parameters ────────────────────────────────────
    params: {
      title: 'Optimization Parameters',
      distributionMethod: 'Distribution Method',
      countMode: 'By Customer Count',
      workloadMode: 'By Workload Balance',
      numberOfRoutes: 'Number of Routes',
      customersPerRoute: 'Customers per Route',
      workingDaysPerWeek: 'Working Days per Week',
      workingDays: {
        six: '6 (Sat–Thu)',
        five: '5',
        four: '4',
      },
      avgVisitTime: 'Avg. Visit Time',
      avgVisitTimeUnit: 'minutes',
      workingHoursPerDay: 'Working Hours per Day',
      avgSpeed: 'Avg. Driving Speed',
      speedUnit: 'km/h',
      weeklyFrequencySource: 'Weekly Frequency Source',
      automatic: 'Automatic (from data)',
      uniform: 'Uniform',
      frequencyPerWeek: 'Frequency per Week',
      outlierIsolationDist: 'Outlier Isolation Distance',
      distanceUnit: 'km',
      createOutstationRoutes: 'Create Outstation Routes',
      outlierLinkDist: 'Outlier Link Distance',
      dailyKmCap: 'Daily KM Cap',
      disabledHint: '0 = disabled',
      runOptimization: 'Run Optimization',
      optimizing: 'Optimizing…',
      cancel: 'Cancel',
    },

    // ─── Progress ───────────────────────────────────────────────────
    progress: {
      title: 'Optimization Progress',
      stepDistributing: 'Distributing customers across routes…',
      stepSequencing: 'Sequencing daily visits…',
      stepAllocating: 'Allocating weekly schedules…',
      stepCalculating: 'Calculating distances and KPIs…',
      completed: 'Optimization completed',
    },

    // ─── Results – Map ──────────────────────────────────────────────
    map: {
      title: 'Route Map',
      showRoute: 'Show Route',
      hideRoute: 'Hide Route',
      showAll: 'Show All',
      hideAll: 'Hide All',
      routeLabel: 'Route {{number}}',
      customers: 'Customers',
      depot: 'Depot',
      outlier: 'Outlier',
      outstation: 'Outstation',
      normalRoute: 'Normal Route',
      outstationRoute: 'Outstation Route',
    },

    // ─── Results – Route Cards ──────────────────────────────────────
    routeCards: {
      title: 'Route Summary',
      routeNumber: 'Route {{number}}',
      routeType: 'Route Type',
      weeklyKm: 'Weekly KM',
      monthlyKm: 'Monthly KM',
      sellingTimeRatio: 'Selling Time Ratio',
      avgDailyHours: 'Avg. Daily Hours',
      dayDetail: {
        dayNumber: 'Day {{number}}',
        dayCustomers: '{{count}} customers',
        dayKm: '{{km}} km',
        dayHours: '{{hours}} hrs',
      },
      googleMapsLink: 'Open in Google Maps',
      warnings: {
        hoursExceeded: 'Daily hours exceeded the limit',
        kmExceeded: 'Daily KM exceeded the cap',
        lowSellingTime: 'Selling time ratio is below target',
      },
      normal: 'Normal',
      outstationLabel: 'Outstation',
    },

    // ─── Results – Visit Table ──────────────────────────────────────
    visitTable: {
      title: 'Visit Schedule',
      filterByRoute: 'Filter by Route',
      filterByDay: 'Filter by Day',
      allRoutes: 'All Routes',
      allDays: 'All Days',
      columns: {
        route: 'Route',
        day: 'Day',
        sequence: 'Seq.',
        customerCode: 'Customer Code',
        customerName: 'Customer Name',
        city: 'City',
        frequency: 'Frequency',
        latitude: 'Latitude',
        longitude: 'Longitude',
      },
      noResults: 'No results match the current filters.',
    },

    // ─── Results – KPIs ─────────────────────────────────────────────
    kpi: {
      title: 'Key Performance Indicators',
      totalRoutes: 'Total Routes',
      distributedCustomers: 'Distributed Customers',
      monthlyVisits: 'Monthly Visits',
      monthlyDistance: 'Monthly Distance',
      loadBalance: 'Load Balance',
      avgSellingTime: 'Avg. Selling Time',
      unassignedCustomers: 'Unassigned Customers',
      overloadedRoutes: 'Overloaded Routes',
      commercialRating: 'Commercial Rating',
      outstationSection: 'Outstation Routes',
      needsDecisionSection: 'Needs Decision',
      commentary: {
        excellent: 'Excellent – all routes are within target parameters.',
        good: 'Good – minor adjustments may improve balance.',
        acceptable: 'Acceptable – review overloaded routes for rebalancing.',
        poor: 'Poor – significant rebalancing is recommended.',
      },
    },

    // ─── Start Points / Depot ───────────────────────────────────────
    depot: {
      title: 'Start Points',
      enterCoordinates: 'Enter Coordinates',
      clickOnMap: 'Click on Map',
      selectCustomer: 'Select Customer',
      latitude: 'Latitude',
      longitude: 'Longitude',
      setDepot: 'Set Depot',
      depotSet: 'Depot has been set',
      resetDepot: 'Reset Depot',
    },

    // ─── Journey Plan Print ─────────────────────────────────────────
    print: {
      journeyPlan: 'Print Journey Plan',
      masterPlan: 'Print Master Plan',
      printAll: 'Print All',
      printSelected: 'Print Selected',
      journeyPlanTitle: 'Salesman Journey Plan',
      masterPlanTitle: 'Master Route Plan',
      companyName: 'Company Name',
      salesmanName: 'Salesman Name',
      salesmanNumber: 'Salesman Number',
      branch: 'Branch',
      region: 'Region',
      issueDate: 'Issue Date',
      planPeriod: 'Plan Period',
      totalCustomers: 'Total Customers',
      workingDays: 'Working Days',
      weeklyVisits: 'Weekly Visits',
      startPoint: 'Start Point',
      tableHeaders: {
        seq: 'Seq.',
        customerCode: 'Customer Code',
        customerName: 'Customer Name',
        cityDistrict: 'City / District',
        frequency: 'Frequency',
        done: 'Done',
        notes: 'Notes',
      },
      dayFooter: {
        customersToday: 'Customers today: {{count}}',
        expectedKm: 'Expected KM: {{km}}',
      },
      signatureArea: {
        salesmanSignature: 'Salesman Signature',
        supervisorSignature: 'Supervisor Signature',
      },
      days: {
        saturday: 'Saturday',
        sunday: 'Sunday',
        monday: 'Monday',
        tuesday: 'Tuesday',
        wednesday: 'Wednesday',
        thursday: 'Thursday',
      },
    },

    // ─── Common ─────────────────────────────────────────────────────
    common: {
      save: 'Save',
      cancel: 'Cancel',
      close: 'Close',
      export: 'Export',
      print: 'Print',
      download: 'Download',
      loading: 'Loading…',
      error: 'Error',
      warning: 'Warning',
      info: 'Info',
      success: 'Success',
      yes: 'Yes',
      no: 'No',
      enabled: 'Enabled',
      disabled: 'Disabled',
      km: 'km',
      hours: 'hours',
      minutes: 'minutes',
      perWeek: 'per week',
      perMonth: 'per month',
      noData: 'No data available',
      selectOption: 'Select an option',
    },

    // ─── Before/After Comparison ───────────────────────────────────
    comparison: {
      title: 'Before / After Comparison',
      before: 'Before (Current Distribution)',
      after: 'After (Optimized Routes)',
      salesmenCount: 'Number of Salesmen',
      routesCount: 'Number of Routes',
      customersPerGroup: 'Customers (min / max / avg)',
      customersPerRoute: 'Customers (min / max / avg)',
      loadBalance: 'Load Balance',
      estMonthlyKm: 'Est. Monthly KM',
      totalMonthlyKm: 'Total Monthly KM',
      avgSellingTime: 'Avg. Selling Time',
      distanceSavings: 'Distance Savings',
      betterBalance: 'Balance Improvement',
      minMaxAvgHint: 'Customer counts shown as min / max / avg',
    },

    // ─── Excel Export ───────────────────────────────────────────────
    excel: {
      exportExcel: 'Export to Excel',
      sheetWeeklyPlan: 'Weekly Plan',
      sheetRouteSummary: 'Route Summary',
      sheetNeedsDecision: 'Needs Decision',
      sheetUnassigned: 'Unassigned',
    },
  },
} as const;

export default en;
