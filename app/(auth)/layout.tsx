export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col bg-slate-50 shadow-sm">
      {children}
    </div>
  );
}
