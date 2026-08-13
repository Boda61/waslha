// Shared challenge dataset (single source of truth).
// Used by both the Cloud Functions (auto-seed) and tools/seedChallenges.mjs.
// `correctIndex` is kept OUT of the public `challenges` docs — it lives only in
// `challengeSecrets`, which clients can never read.
module.exports = {
  CHALLENGES: [
    { id: 'c01', title: 'شرب الصبح', imageA: { emoji: '☕', label: 'قهوة الصبح' }, imageB: { emoji: '🥛', label: 'لبن' }, choices: ['مشروبات', 'أكل شامي', 'حلويات', 'فواكه'], correctIndex: 0, category: 'حاجات', difficulty: 'سهل' },
    { id: 'c02', title: 'في المطبخ', imageA: { emoji: '🥄', label: 'معلقة' }, imageB: { emoji: '🍳', label: 'طاسة' }, choices: ['أدوات مطبخ', 'نوم', 'قراءة', 'لعب'], correctIndex: 0, category: 'حاجات', difficulty: 'سهل' },
    { id: 'c03', title: 'الدراسة', imageA: { emoji: '📚', label: 'كتاب' }, imageB: { emoji: '✏️', label: 'قلم' }, choices: ['أدوات مكتبية', 'ملابس', 'أثاث', 'ميكانيكا'], correctIndex: 0, category: 'أماكن', difficulty: 'سهل' },
    { id: 'c04', title: 'الفواكه الحلوة', imageA: { emoji: '🍉', label: 'بطيخ' }, imageB: { emoji: '🍌', label: 'موز' }, choices: ['فواكه', 'خضار', 'أكل بحري', 'لحوم'], correctIndex: 0, category: 'أكل', difficulty: 'سهل' },
    { id: 'c05', title: 'فيه حيوانات', imageA: { emoji: '🐱', label: 'قطة' }, imageB: { emoji: '🐶', label: 'كلب' }, choices: ['حيوانات أليفة', 'طيور برية', 'حشرات', 'زواحف'], correctIndex: 0, category: 'حيوانات', difficulty: 'سهل' },
    { id: 'c06', title: 'النقل', imageA: { emoji: '🚗', label: 'عربية' }, imageB: { emoji: '🛵', label: 'توك توك' }, choices: ['مواصلات', 'طيارات', 'سفن', 'قطارات'], correctIndex: 0, category: 'مواصلات', difficulty: 'متوسط' },
    { id: 'c07', title: 'الصلاة', imageA: { emoji: '🕌', label: 'مسجد' }, imageB: { emoji: '📿', label: 'سبحة' }, choices: ['حاجات دينية', 'هدوم', 'كتب أجنبية', 'موسيقى'], correctIndex: 0, category: 'دين', difficulty: 'متوسط' },
    { id: 'c08', title: 'الحفلة', imageA: { emoji: '🎂', label: 'كيكة' }, imageB: { emoji: '🎈', label: 'بالونة' }, choices: ['احتفال', 'عزاء', 'دوام', 'رياضة'], correctIndex: 0, category: 'مناسبات', difficulty: 'متوسط' },
    { id: 'c09', title: 'الصيف', imageA: { emoji: '😎', label: 'نضارة شمس' }, imageB: { emoji: '🏖️', label: 'شط' }, choices: ['الاجازة', 'الشتا', 'الشغل', 'الدراسة'], correctIndex: 0, category: 'مواسم', difficulty: 'متوسط' },
    { id: 'c10', title: 'السوق', imageA: { emoji: '🥬', label: 'خضار' }, imageB: { emoji: '🍅', label: 'طماطم' }, choices: ['خضار وفاكهة', 'هدوم', 'موبايلات', 'أثاث'], correctIndex: 0, category: 'أكل', difficulty: 'سهل' },
    { id: 'c11', title: 'الشغل', imageA: { emoji: '💻', label: 'لابتوب' }, imageB: { emoji: '💼', label: 'شنطة' }, choices: ['مكتب وشغل', 'مطبخ', 'حمام', 'شارع'], correctIndex: 0, category: 'أماكن', difficulty: 'متوسط' },
    { id: 'c12', title: 'الحيوانات البرية', imageA: { emoji: '🦁', label: 'أسد' }, imageB: { emoji: '🐘', label: 'فيل' }, choices: ['حيوانات برية', 'أسماك', 'طيور', 'حشرات'], correctIndex: 0, category: 'حيوانات', difficulty: 'سهل' },
  ],
};
