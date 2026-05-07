export default function Button({ children, variant = 'primary', size = 'md', className = '', ...props }) {
  const variants = {
    primary: 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-200',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white shadow-amber-200',
    danger: 'bg-red-600 hover:bg-red-700 text-white shadow-red-200',
    ghost: 'bg-slate-100 hover:bg-slate-200 text-slate-700'
  };
  const sizes = {
    sm: 'px-3 py-1 text-sm',
    md: 'px-4 py-2',
    lg: 'w-full px-6 py-3'
  };
  return (
    <button
      className={`rounded-xl font-semibold shadow-md transition-all active:scale-95 ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
