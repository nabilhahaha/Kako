/** organization module messages. Generic org-structure admin UI
 *  (departments / teams / job titles / employee assignment & reporting).
 *  Keep ar/en keys identical. */
export const ar = {
  organization: {
    // Page header
    pageTitle: 'الهيكل التنظيمي',
    pageDescription: 'إدارة الأقسام والفرق والمسميات الوظيفية وخطوط الإدارة للموظفين',

    // Access
    superAdminOnly: 'هذه الصفحة متاحة لمدير الشركة فقط.',

    // Tabs
    tabDepartments: 'الأقسام',
    tabTeams: 'الفرق',
    tabJobTitles: 'المسميات الوظيفية',
    tabEmployees: 'الموظفون',

    // Shared field labels
    fieldNameEn: 'الاسم (إنجليزي) *',
    fieldNameAr: 'الاسم (عربي)',
    fieldBranch: 'الفرع',
    fieldDepartment: 'القسم',
    fieldManager: 'المدير',
    fieldLead: 'قائد الفريق',
    fieldJobTitle: 'المسمى الوظيفي',
    fieldReportsTo: 'يتبع إدارياً',
    fieldActive: 'نشط',

    // Placeholders / option labels
    noneOption: '— بدون —',
    branchPlaceholder: 'كل الفروع',
    departmentPlaceholder: 'اختر قسماً…',
    namePlaceholder: 'مثال: المبيعات',

    // Buttons
    btnNewDepartment: 'قسم جديد',
    btnNewTeam: 'فريق جديد',
    btnNewJobTitle: 'مسمى وظيفي جديد',
    btnSave: 'حفظ',
    btnCancel: 'إلغاء',
    btnEdit: 'تعديل',
    btnDeactivate: 'إيقاف',
    btnActivate: 'تفعيل',

    // Form titles
    formNewDepartment: 'قسم جديد',
    formEditDepartment: 'تعديل القسم',
    formNewTeam: 'فريق جديد',
    formEditTeam: 'تعديل الفريق',
    formNewJobTitle: 'مسمى وظيفي جديد',
    formEditJobTitle: 'تعديل المسمى الوظيفي',

    // List column headers / labels
    colName: 'الاسم',
    colBranch: 'الفرع',
    colDepartment: 'القسم',
    colManager: 'المدير',
    colLead: 'قائد الفريق',
    colStatus: 'الحالة',
    colEmployee: 'الموظف',
    colJobTitle: 'المسمى الوظيفي',
    colTeam: 'الفريق',
    colReportsTo: 'يتبع إدارياً',
    colActions: 'إجراءات',

    // Statuses / badges
    statusActive: 'نشط',
    statusInactive: 'موقوف',
    allBranches: 'كل الفروع',
    noManager: 'بدون مدير',
    noLead: 'بدون قائد',
    noDepartment: 'بدون قسم',

    // Empty states
    emptyDepartments: 'لا توجد أقسام بعد.',
    emptyTeams: 'لا توجد فرق بعد.',
    emptyJobTitles: 'لا توجد مسميات وظيفية بعد.',
    emptyEmployees: 'لا يوجد موظفون بعد.',

    // Toasts
    toastDepartmentSaved: 'تم حفظ القسم',
    toastTeamSaved: 'تم حفظ الفريق',
    toastJobTitleSaved: 'تم حفظ المسمى الوظيفي',
    toastEmployeeSaved: 'تم حفظ بيانات الموظف',
    toastActivated: 'تم التفعيل',
    toastDeactivated: 'تم الإيقاف',
    toastError: 'حدث خطأ',

    // Errors
    errNameRequired: 'الاسم مطلوب.',
    errUnauthorized: 'غير مصرّح.',
  },
};

export const en = {
  organization: {
    // Page header
    pageTitle: 'Organization',
    pageDescription: 'Manage departments, teams, job titles and reporting lines for staff',

    // Access
    superAdminOnly: 'This page is available to the company admin only.',

    // Tabs
    tabDepartments: 'Departments',
    tabTeams: 'Teams',
    tabJobTitles: 'Job Titles',
    tabEmployees: 'Employees',

    // Shared field labels
    fieldNameEn: 'Name (English) *',
    fieldNameAr: 'Name (Arabic)',
    fieldBranch: 'Branch',
    fieldDepartment: 'Department',
    fieldManager: 'Manager',
    fieldLead: 'Team Lead',
    fieldJobTitle: 'Job Title',
    fieldReportsTo: 'Reports To',
    fieldActive: 'Active',

    // Placeholders / option labels
    noneOption: '— None —',
    branchPlaceholder: 'All branches',
    departmentPlaceholder: 'Select a department…',
    namePlaceholder: 'e.g. Sales',

    // Buttons
    btnNewDepartment: 'New Department',
    btnNewTeam: 'New Team',
    btnNewJobTitle: 'New Job Title',
    btnSave: 'Save',
    btnCancel: 'Cancel',
    btnEdit: 'Edit',
    btnDeactivate: 'Deactivate',
    btnActivate: 'Activate',

    // Form titles
    formNewDepartment: 'New Department',
    formEditDepartment: 'Edit Department',
    formNewTeam: 'New Team',
    formEditTeam: 'Edit Team',
    formNewJobTitle: 'New Job Title',
    formEditJobTitle: 'Edit Job Title',

    // List column headers / labels
    colName: 'Name',
    colBranch: 'Branch',
    colDepartment: 'Department',
    colManager: 'Manager',
    colLead: 'Team Lead',
    colStatus: 'Status',
    colEmployee: 'Employee',
    colJobTitle: 'Job Title',
    colTeam: 'Team',
    colReportsTo: 'Reports To',
    colActions: 'Actions',

    // Statuses / badges
    statusActive: 'Active',
    statusInactive: 'Inactive',
    allBranches: 'All branches',
    noManager: 'No manager',
    noLead: 'No lead',
    noDepartment: 'No department',

    // Empty states
    emptyDepartments: 'No departments yet.',
    emptyTeams: 'No teams yet.',
    emptyJobTitles: 'No job titles yet.',
    emptyEmployees: 'No employees yet.',

    // Toasts
    toastDepartmentSaved: 'Department saved',
    toastTeamSaved: 'Team saved',
    toastJobTitleSaved: 'Job title saved',
    toastEmployeeSaved: 'Employee saved',
    toastActivated: 'Activated',
    toastDeactivated: 'Deactivated',
    toastError: 'An error occurred',

    // Errors
    errNameRequired: 'Name is required.',
    errUnauthorized: 'Unauthorized.',
  },
};
