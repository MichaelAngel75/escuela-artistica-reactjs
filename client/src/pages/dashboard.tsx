import { useAppStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, FileBadge, Users, Award } from "lucide-react";

export default function Dashboard() {
  const { user, signatures, templates, users } = useAppStore();

  const stats = [
    {
      title: "Total Users",
      value: users.length,
      icon: Users,
      color: "text-blue-600",
      bg: "bg-blue-100",
    },
    {
      title: "Active Templates",
      value: templates.filter(t => t.status === 'active').length,
      icon: FileBadge,
      color: "text-amber-600",
      bg: "bg-amber-100",
    },
    {
      title: "Signatures",
      value: signatures.length,
      icon: FileSignature,
      color: "text-emerald-600",
      bg: "bg-emerald-100",
    },
    {
      title: "Diplomas Generated",
      value: "1,248",
      icon: Award,
      color: "text-purple-600",
      bg: "bg-purple-100",
    },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-serif font-bold text-primary">Welcome back, {user?.name}</h1>
        <p className="text-muted-foreground">Here is an overview of the certification system.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, i) => (
          <Card key={i} className="border-none shadow-md hover:shadow-lg transition-shadow">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {stat.title}
              </CardTitle>
              <div className={`p-2 rounded-full ${stat.bg}`}>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold font-serif">{stat.value}</div>
              <p className="text-xs text-muted-foreground mt-1">
                +20.1% from last month
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <Card className="col-span-4 border-none shadow-md">
          <CardHeader>
            <CardTitle>Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-8">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center">
                  <div className="ml-4 space-y-1">
                    <p className="text-sm font-medium leading-none">Diploma Generation Batch #{1000+i}</p>
                    <p className="text-sm text-muted-foreground">
                      Processed 45 certificates for Computer Science 101
                    </p>
                  </div>
                  <div className="ml-auto font-medium text-sm text-muted-foreground">
                    {i}h ago
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
        
        <Card className="col-span-3 border-none shadow-md bg-primary text-primary-foreground">
          <CardHeader>
            <CardTitle className="text-primary-foreground">Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
             <p className="text-sm opacity-90">Ready to generate new certificates?</p>
             <button className="w-full bg-white text-primary hover:bg-white/90 h-10 rounded-md font-medium text-sm transition-colors">
               Start New Batch
             </button>
             <div className="h-[1px] bg-white/20 my-4" />
             <p className="text-sm opacity-90">Need to update signatures?</p>
             <button className="w-full bg-primary-foreground/10 hover:bg-primary-foreground/20 h-10 rounded-md font-medium text-sm transition-colors border border-white/20">
               Manage Signatures
             </button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
