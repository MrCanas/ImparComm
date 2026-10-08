/** Lo mínimo del usuario que necesita el shell en el cliente. */
export interface ShellUser {
  name: string;
  email: string;
  isAdmin: boolean;
  canSeeBolsa: boolean;
}
