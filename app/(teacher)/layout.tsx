export default function TeacherLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-[360px] flex-col bg-[#F8FAFC] shadow-sm">
      {children}
    </div>
  );
}
