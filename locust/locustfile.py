from locust import HttpUser, task, between


class EnforcerUser(HttpUser):
    wait_time = between(0.5, 1.5)
    token = None

    def on_start(self):
        response = self.client.post(
            "/api/auth/token/",
            json={"username": "testenforcer1", "password": "test1234"},
        )
        self.token = response.json().get("access")

    @task
    def check_plate(self):
        self.client.post(
            "/api/check/",
            json={"plate_text": "ABC123", "latitude": 47.4979, "longitude": 19.0402},
            headers={"Authorization": f"Bearer {self.token}"},
        )
