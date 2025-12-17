import { useAppStore, User, Role } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useState } from "react";
import { Plus, Search, UserCog, Trash2 } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PaginationControls } from "@/components/shared/PaginationControls";
import { DeleteConfirmDialog } from "@/components/shared/DeleteConfirmDialog";

export default function UsersPage() {
  const { users, addUser, deleteUser, updateUser } = useAppStore();
  const { toast } = useToast();
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(5);

  const handleDelete = (id: string) => {
    deleteUser(id);
    toast({ title: "Usuario Borrado", description: "El usuario fue eliminado.", variant: "success" });
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    u.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Pagination Logic
  const totalPages = Math.ceil(filteredUsers.length / itemsPerPage);
  const paginatedUsers = filteredUsers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleRowClick = (user: User) => {
      setEditingUser(user);
      setIsDialogOpen(true);
  };
  
  const [editingUser, setEditingUser] = useState<User | null>(null);

  const AddEditUserForm = () => {
    const { register, handleSubmit, control, reset } = useForm<Omit<User, 'id'>>({
        defaultValues: editingUser ? {
            name: editingUser.name,
            email: editingUser.email,
            role: editingUser.role
        } : {}
    });
    
    const onSubmit = (data: Omit<User, 'id'>) => {
        try {
            if (editingUser) {
                updateUser(editingUser.id, data);
                toast({ title: "Usuario actualizado", description: "Detalles de usuario guardados.", variant: "success" });
            } else {
                addUser({
                    ...data,
                    photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.name}`,
                    googleId: `manual-${Date.now()}`
                });
                toast({ title: "Exitosamente", description: "Nuevo usuario creado.", variant: "success" });
            }
            reset();
            setIsDialogOpen(false);
            setEditingUser(null);
        } catch (e) {
            toast({ title: "Error", description: "Operation failed.", variant: "destructive" });
        }
    };

    return (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
                <label className="text-sm font-medium">Nombre completo</label>
                <Input {...register("name", { required: true })} placeholder="John Doe" />
            </div>
            <div>
                <label className="text-sm font-medium">Email</label>
                <Input {...register("email", { required: true })} type="email" placeholder="john@example.com" />
            </div>
            <div>
                <label className="text-sm font-medium">Role</label>
                <Controller
                    control={control}
                    name="role"
                    defaultValue="student"
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sys_admin">System Admin</SelectItem>
                                <SelectItem value="servicios_escolares">Servicios Escolares</SelectItem>
                                <SelectItem value="professor">Professor</SelectItem>
                                <SelectItem value="student">Student</SelectItem>
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>
            <Button type="submit" className="w-full">{editingUser ? 'Update User' : 'Create User'}</Button>
        </form>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-serif font-bold text-primary">Users & Roles</h1>
          <p className="text-muted-foreground">Manage system access and permissions</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={(open) => { setIsDialogOpen(open); if (!open) setEditingUser(null); }}>
            <DialogTrigger asChild>
                <Button className="gap-2">
                    <Plus className="w-4 h-4" /> Add User
                </Button>
            </DialogTrigger>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{editingUser ? 'Edit User' : 'Create New User'}</DialogTitle>
                </DialogHeader>
                <AddEditUserForm />
            </DialogContent>
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
            <div className="flex items-center gap-2 bg-muted/50 p-2 rounded-md w-full md:w-80">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input 
                    className="bg-transparent border-none outline-none text-sm w-full placeholder:text-muted-foreground" 
                    placeholder="Search users..." 
                    value={searchTerm}
                    onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                />
            </div>
        </CardHeader>
        <CardContent className="p-0">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead className="pl-6">User</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Google ID</TableHead>
                        <TableHead className="text-right pr-6">Actions</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {paginatedUsers.map((u) => (
                        <TableRow 
                            key={u.id}
                            className="cursor-pointer hover:bg-muted/50 transition-colors"
                            onClick={() => handleRowClick(u)}
                        >
                            <TableCell className="pl-6">
                                <div className="flex items-center gap-3">
                                    <Avatar className="h-8 w-8">
                                        <AvatarImage src={u.photoUrl} />
                                        <AvatarFallback>{u.name[0]}</AvatarFallback>
                                    </Avatar>
                                    <span className="font-medium">{u.name}</span>
                                </div>
                            </TableCell>
                            <TableCell>{u.email}</TableCell>
                            <TableCell>
                                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary capitalize">
                                    {u.role.replace('_', ' ')}
                                </span>
                            </TableCell>
                            <TableCell className="text-muted-foreground text-xs font-mono">{u.googleId}</TableCell>
                            <TableCell className="text-right pr-6">
                                <div className="flex items-center justify-end gap-2">
                                    <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()}>
                                        <UserCog className="w-4 h-4 text-muted-foreground" />
                                    </Button>
                                    <div onClick={(e) => e.stopPropagation()}>
                                    <DeleteConfirmDialog 
                                        onConfirm={() => handleDelete(u.id)}
                                        trigger={
                                            <Button 
                                                variant="ghost" 
                                                size="icon" 
                                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </Button>
                                        }
                                        title="Delete User"
                                        description={`Are you sure you want to remove user ${u.name}? They will lose access immediately.`}
                                    />
                                    </div>
                                </div>
                            </TableCell>
                        </TableRow>
                    ))}

                </TableBody>
            </Table>
            
            {filteredUsers.length > 0 && (
                <PaginationControls 
                    currentPage={currentPage}
                    totalPages={totalPages}
                    onPageChange={setCurrentPage}
                    itemsPerPage={itemsPerPage}
                    onItemsPerPageChange={setItemsPerPage}
                    totalRecords={filteredUsers.length}
                />
            )}
        </CardContent>
      </Card>
    </div>
  );
}
