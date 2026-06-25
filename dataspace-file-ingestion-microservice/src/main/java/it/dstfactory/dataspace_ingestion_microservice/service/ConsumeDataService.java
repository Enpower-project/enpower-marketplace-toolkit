package it.dstfactory.dataspace_ingestion_microservice.service;

import it.dstfactory.dataspace_ingestion_microservice.dto.ConsumeData;
import it.dstfactory.dataspace_ingestion_microservice.dto.ConsumeDataPageResponse;
import it.dstfactory.dataspace_ingestion_microservice.dto.LoginBody;
import it.dstfactory.dataspace_ingestion_microservice.dto.LoginResponse;
import jakarta.transaction.Transactional;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

@Service
@Transactional
@RequiredArgsConstructor
@Slf4j
public class ConsumeDataService {

    private final RestTemplate restTemplate;

    private static final String CONSUME_DATA_URL = "https://enpower-localapi2.dstech.info/api/consume-data/page/{page}";
    private static final String CONSUME_DATA_BY_ID_URL = "https://enpower-localapi2.dstech.info/api/consume-data/by-id";
    private static final String LOGIN_URL = "https://enpower-localapi2.dstech.info/api/user/auth";
    private static final long TOKEN_TTL_SECONDS = 600; // reusar token durante 10 minutos

    private volatile String cachedToken = null;
    private volatile Instant tokenExpiry = Instant.MIN;

    public String getToken(String username) {
        if (cachedToken != null && Instant.now().isBefore(tokenExpiry)) {
            log.debug("Reusing cached auth token");
            return cachedToken;
        }

        String resolvedUsername = (username != null && !username.isBlank()) ? username : "dst-2";
        LoginBody loginBody = new LoginBody("dst-2","@dst!");
        LoginResponse response = restTemplate.postForObject(LOGIN_URL, loginBody, LoginResponse.class);

        if (response == null || response.getAccessToken() == null) {
            throw new RuntimeException("Failed to obtain auth token");
        }

        cachedToken = response.getAccessToken();
        tokenExpiry = Instant.now().plusSeconds(TOKEN_TTL_SECONDS);
        log.info("Auth token obtained successfully for user: {}", resolvedUsername);
        return cachedToken;
    }



    @Transactional
    public List<ConsumeData> getAllConsumeData(String username) {
        String token = getToken(username);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        List<ConsumeData> allData = new ArrayList<>();
        int currentPage = 0;
        int totalPages;

        do {
            log.info("Fetching consume data page {}", currentPage);
            String url = CONSUME_DATA_URL.replace("{page}", String.valueOf(currentPage));

            ResponseEntity<ConsumeDataPageResponse> response = restTemplate.exchange(
                    url, HttpMethod.GET, entity, ConsumeDataPageResponse.class
            );

            ConsumeDataPageResponse body = response.getBody();
            if (body == null || body.getListContent() == null) {
                log.warn("Null response on page {}", currentPage);
                break;
            }

            allData.addAll(body.getListContent());
            totalPages = body.getTotalPages();
            currentPage++;

        } while (currentPage < totalPages);

        log.info("Fetched {} total consume data items", allData.size());
        return allData;
    }

    public String getConsumeDataById(String id, String username) {
        String token = getToken(username);

        HttpHeaders headers = new HttpHeaders();
        headers.setBearerAuth(token);
        HttpEntity<Void> entity = new HttpEntity<>(headers);

        String url = CONSUME_DATA_BY_ID_URL + "?id=" + id;
        log.info("Fetching consume data by id: {}", id);

        ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
        return response.getBody();
    }

}
