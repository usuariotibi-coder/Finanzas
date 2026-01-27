export const NEW_PROJECT_ID = '__nuevo_proyecto__';

export const formatProyectoLabel = (proyectoNombre?: string, proyectoId?: string) => {
  if (proyectoNombre && proyectoNombre.trim()) {
    return proyectoNombre;
  }
  if (proyectoId === NEW_PROJECT_ID) {
    return 'Nuevo Proyecto';
  }
  return proyectoId || '';
};
