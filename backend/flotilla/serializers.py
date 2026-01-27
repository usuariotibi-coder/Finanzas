from rest_framework import serializers

from .models import (
    CargaGasolina,
    MaintenanceRecord,
    Vehicle,
    VehicleAlert,
    VehicleAssignment,
    VehicleExpense,
)


class VehicleSerializer(serializers.ModelSerializer):
    class Meta:
        model = Vehicle
        fields = '__all__'


class VehicleAssignmentSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)
    vehicle_label = serializers.SerializerMethodField()
    proyecto_nombre = serializers.CharField(source='proyecto.nombre', read_only=True)

    class Meta:
        model = VehicleAssignment
        fields = '__all__'

    def get_vehicle_label(self, obj):
        if not obj.vehicle_id:
            return ''
        return f'{obj.vehicle.marca} {obj.vehicle.modelo} ({obj.vehicle.placas})'


class VehicleAlertSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleAlert
        fields = '__all__'


class VehicleExpenseSerializer(serializers.ModelSerializer):
    class Meta:
        model = VehicleExpense
        fields = '__all__'


class CargaGasolinaSerializer(serializers.ModelSerializer):
    user_name = serializers.CharField(source='user.full_name', read_only=True)

    class Meta:
        model = CargaGasolina
        fields = '__all__'


class MaintenanceRecordSerializer(serializers.ModelSerializer):
    class Meta:
        model = MaintenanceRecord
        fields = '__all__'
