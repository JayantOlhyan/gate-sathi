export default function AdminLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-[#F8FAFC]">
      {children}
    </div>
  );
}
