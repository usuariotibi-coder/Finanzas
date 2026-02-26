from django.urls import path

from .views import (
    AdminRegisterView,
    AdminUserDetailView,
    AdminUserListView,
    CSRFTokenView,
    ChangePasswordView,
    LoginView,
    LogoutView,
    MeView,
    RegisterView,
)

urlpatterns = [
    path('csrf/', CSRFTokenView.as_view(), name='auth-csrf'),
    path('register/', RegisterView.as_view(), name='auth-register'),
    path('admin/register/', AdminRegisterView.as_view(), name='auth-admin-register'),
    path('admin/users/', AdminUserListView.as_view(), name='auth-admin-users'),
    path('admin/users/<int:user_id>/', AdminUserDetailView.as_view(), name='auth-admin-user-detail'),
    path('login/', LoginView.as_view(), name='auth-login'),
    path('logout/', LogoutView.as_view(), name='auth-logout'),
    path('me/', MeView.as_view(), name='auth-me'),
    path('change-password/', ChangePasswordView.as_view(), name='auth-change-password'),
]
