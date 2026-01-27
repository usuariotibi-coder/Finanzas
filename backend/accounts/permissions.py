from rest_framework import permissions


class RoleRequired(permissions.BasePermission):
    allowed_roles: tuple[str, ...] = ()

    def has_permission(self, request, view) -> bool:
        return bool(request.user and request.user.is_authenticated and request.user.role in self.allowed_roles)


class IsAdmin(RoleRequired):
    allowed_roles = ('admin',)


class IsPM(RoleRequired):
    allowed_roles = ('pm',)


class IsStaff(RoleRequired):
    allowed_roles = ('staff',)


class IsAdminOrPM(RoleRequired):
    allowed_roles = ('admin', 'pm')


class IsAdminOrStaff(RoleRequired):
    allowed_roles = ('admin', 'staff')


class IsAdminOrPMOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.role in ('admin', 'pm'))


class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view) -> bool:
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_authenticated and request.user.role == 'admin')
